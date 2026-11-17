import { MODEL_VERSION, type SpectralModel } from '../audio/model'

export interface VoiceSettings {
  attackSeconds: number
  releaseSeconds: number
  maxVoices: number
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { attackSeconds: 0.005, releaseSeconds: 0.5, maxVoices: 8 }

/** Fade applied to a voice before it is reused for a new note. */
export const STEAL_FADE_SECONDS = 0.005

/** Equal-tempered frequency of a MIDI note: 440 · 2^((note − 69) / 12). */
export function noteToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

const TABLE_SIZE = 4096
/** One sine cycle plus a guard point, for linear interpolation with phase in [0, 1). */
const SINE = Float64Array.from({ length: TABLE_SIZE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE_SIZE))

function tableSin(phase: number): number {
  const x = phase * TABLE_SIZE
  const i = x | 0
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i)
}

/** Linear blend of two frame ratios; a silent end (ratio 0) holds the other so a fade does not sweep from 0 Hz. */
function blendRatio(a: number, b: number, t: number): number {
  const r0 = a || b
  const r1 = b || r0
  return r0 + (r1 - r0) * t
}

/** Release ends when its gain falls to −60 dB. */
const RELEASE_FLOOR = 1e-3
/** Sub-block length: amplitude and frequency are interpolated linearly across each sub-block. */
const SUB_BLOCK = 64

type VoiceState = 'off' | 'held' | 'released' | 'stealing'

interface PendingNote {
  note: number
  gain: number
  held: boolean
}

interface Voice {
  state: VoiceState
  note: number
  gain: number
  /** Position in model frames. */
  pos: number
  phases: Float64Array
  /** Samples since the note started, for the attack ramp. */
  age: number
  releaseGain: number
  stealGain: number
  pending: PendingNote | null
  /** Note-on order, for choosing which voice to steal. */
  order: number
}

/**
 * Polyphonic additive voices that play a SpectralModel in real time. Pure DSP: runs inside the
 * AudioWorklet and under Vitest. Each voice plays frames at `hopSize` samples per frame, holds the
 * sustain frame while its note is down, and plays on to the end under a release fade after note-off.
 */
export class VoiceBank {
  private readonly sampleRate: number
  private settings: VoiceSettings
  private model: SpectralModel | null = null
  private sustainFrame = 0
  private voices: Voice[] = []
  private counter = 0
  private releaseCoef = 0
  private framesPerSample = 0
  /** Per-sample envelope scratch, reused so the audio thread does not allocate. */
  private readonly env = new Float64Array(SUB_BLOCK)

  constructor(sampleRate: number, settings?: Partial<VoiceSettings>) {
    this.sampleRate = sampleRate
    this.settings = { ...DEFAULT_VOICE_SETTINGS, ...settings }
    this.applySettings()
  }

  /** Stops all voices at once. Throws RangeError on an unknown model version. */
  setModel(model: SpectralModel, sustainFrame: number): void {
    if (model.version !== MODEL_VERSION) throw new RangeError(`Unknown spectral model version ${model.version}`)
    this.model = model
    this.sustainFrame = Math.min(Math.max(0, Math.round(sustainFrame)), model.frameCount - 1)
    this.framesPerSample = model.sampleRate / model.hopSize / this.sampleRate
    this.voices = this.makeVoices()
  }

  setSettings(settings: Partial<VoiceSettings>): void {
    const maxChanged = settings.maxVoices !== undefined && settings.maxVoices !== this.settings.maxVoices
    this.settings = { ...this.settings, ...settings }
    this.applySettings()
    if (maxChanged) this.voices = this.makeVoices()
  }

  /** note 0..127, velocity 1..127. Ignored when no model is set. */
  noteOn(note: number, velocity: number): void {
    if (!this.model || velocity <= 0) return
    const pending: PendingNote = { note, gain: (Math.min(127, velocity) / 127) ** 2, held: true }
    const same = this.voices.find((v) => v.state !== 'off' && (v.note === note || v.pending?.note === note))
    const free = this.voices.find((v) => v.state === 'off')
    const target = same ?? free ?? this.oldest('released') ?? this.oldest('held') ?? this.oldest('stealing')
    if (!target) return
    if (target.state === 'off') this.start(target, pending)
    else {
      target.state = 'stealing'
      target.pending = pending
    }
    target.order = ++this.counter
  }

  /** Unknown note: no effect. */
  noteOff(note: number): void {
    for (const v of this.voices) {
      if (v.state === 'held' && v.note === note) v.state = 'released'
      if (v.pending?.note === note) v.pending.held = false
    }
  }

  /** Releases every voice; the release fade applies. */
  allNotesOff(): void {
    for (const v of this.voices) {
      if (v.state === 'held') v.state = 'released'
      if (v.pending) v.pending.held = false
    }
  }

  /** Overwrites `out` with the next block of audio. */
  process(out: Float32Array): void {
    out.fill(0)
    const model = this.model
    if (!model) return
    for (let start = 0; start < out.length; start += SUB_BLOCK) {
      const block = out.subarray(start, Math.min(out.length, start + SUB_BLOCK))
      for (const v of this.voices) if (v.state !== 'off') this.render(v, model, block)
    }
  }

  /** Voices that are still sounding. */
  get voiceCount(): number {
    return this.voices.filter((v) => v.state !== 'off').length
  }

  private applySettings(): void {
    const releaseSamples = Math.max(1, this.settings.releaseSeconds * this.sampleRate)
    this.releaseCoef = RELEASE_FLOOR ** (1 / releaseSamples)
  }

  private makeVoices(): Voice[] {
    const partials = this.model?.partialCount ?? 0
    return Array.from({ length: this.settings.maxVoices }, () => ({
      state: 'off' as VoiceState,
      note: -1,
      gain: 0,
      pos: 0,
      phases: new Float64Array(partials),
      age: 0,
      releaseGain: 1,
      stealGain: 1,
      pending: null,
      order: 0,
    }))
  }

  private oldest(state: VoiceState): Voice | undefined {
    let best: Voice | undefined
    for (const v of this.voices) if (v.state === state && (!best || v.order < best.order)) best = v
    return best
  }

  private start(v: Voice, p: PendingNote): void {
    v.state = p.held ? 'held' : 'released'
    v.note = p.note
    v.gain = p.gain
    v.pos = 0
    v.phases.fill(0)
    v.age = 0
    v.releaseGain = 1
    v.stealGain = 1
    v.pending = null
  }

  /** Adds one sub-block of voice `v` to `out`; amp and frequency interpolate linearly across it. */
  private render(v: Voice, model: SpectralModel, out: Float32Array): void {
    const n = out.length
    const { partialCount, amp, ratio, frameCount } = model
    const last = frameCount - 1
    const hz = noteToHz(v.note)
    const nyquist = this.sampleRate / 2
    const posStart = v.pos
    let posEnd = posStart + this.framesPerSample * n
    if (v.state === 'held' && posStart <= this.sustainFrame) posEnd = Math.min(posEnd, this.sustainFrame)

    // Envelope gain per sample: velocity × attack ramp × release × steal fade.
    const env = this.env
    const attackSamples = Math.max(1, this.settings.attackSeconds * this.sampleRate)
    const stealStep = 1 / Math.max(1, STEAL_FADE_SECONDS * this.sampleRate)
    for (let i = 0; i < n; i++) {
      if (v.state === 'released') v.releaseGain *= this.releaseCoef
      if (v.state === 'stealing') v.stealGain = Math.max(0, v.stealGain - stealStep)
      env[i] = v.gain * Math.min(1, (v.age + i) / attackSamples) * v.releaseGain * v.stealGain
    }

    // Frame indices and blend weights at the sub-block start (s) and end (e).
    const s0 = Math.min(last, Math.floor(posStart))
    const s1 = Math.min(last, s0 + 1)
    const st = posStart - s0
    const e0 = Math.min(last, Math.floor(posEnd))
    const e1 = Math.min(last, e0 + 1)
    const et = posEnd - e0

    for (let k = 0; k < partialCount; k++) {
      const a0 = amp[s0 * partialCount + k] * (1 - st) + amp[s1 * partialCount + k] * st
      const a1 = amp[e0 * partialCount + k] * (1 - et) + amp[e1 * partialCount + k] * et
      if (a0 === 0 && a1 === 0) continue
      const f0 = blendRatio(ratio[s0 * partialCount + k], ratio[s1 * partialCount + k], st) * hz
      const f1 = blendRatio(ratio[e0 * partialCount + k], ratio[e1 * partialCount + k], et) * hz
      let phase = v.phases[k]
      if (Math.max(f0, f1) >= nyquist) {
        // Muted, but keep the phase moving so the partial returns without a jump.
        v.phases[k] = (phase + ((f0 + f1) / 2 / this.sampleRate) * n) % 1
        continue
      }
      for (let i = 0; i < n; i++) {
        const t = i / n
        out[i] += (a0 + (a1 - a0) * t) * env[i] * tableSin(phase)
        phase += (f0 + (f1 - f0) * t) / this.sampleRate
        if (phase >= 1) phase -= 1
      }
      v.phases[k] = phase
    }

    v.pos = posEnd
    v.age += n
    this.advanceState(v, last)
  }

  private advanceState(v: Voice, last: number): void {
    if (v.state === 'stealing' && v.stealGain <= 0) {
      if (v.pending) this.start(v, v.pending)
      else v.state = 'off'
      return
    }
    const endedRelease = v.state === 'released' && v.releaseGain <= RELEASE_FLOOR
    const endedModel = v.state !== 'held' && v.pos >= last
    if (endedRelease || endedModel) {
      v.state = 'off'
      v.note = -1
    }
  }
}
