import { getAudioContext } from './context'

/** A captured sound, ready for the analysis step. */
export interface Sample {
  name: string
  source: 'file' | 'mic'
  buffer: AudioBuffer
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer()
  return getAudioContext().decodeAudioData(data)
}

/** Mix all channels down to one Float32Array. Analysis (FFT, pitch) works on mono. */
export function toMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels
  }
  return out
}

/** Min/max pairs per bucket, for drawing a waveform at any width. */
export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const mono = toMono(buffer)
  const peaks = new Float32Array(buckets * 2)
  const size = mono.length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size)
    const end = Math.max(start + 1, Math.floor((b + 1) * size))
    let min = 1
    let max = -1
    for (let i = start; i < end && i < mono.length; i++) {
      const v = mono[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks[b * 2] = min
    peaks[b * 2 + 1] = max
  }
  return peaks
}
