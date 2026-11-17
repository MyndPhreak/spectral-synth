let ctx: AudioContext | null = null

/** One shared AudioContext for capture, analysis and (later) the synth voices. */
export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Browsers start the context suspended until a user gesture. Call from click handlers. */
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext()
  if (c.state === 'suspended') await c.resume()
  return c
}
