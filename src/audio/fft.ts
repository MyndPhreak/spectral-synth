/** In-place complex radix-2 FFT (forward, no scaling). Length must be a power of two, else RangeError. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if (im.length !== n) throw new RangeError(`re and im lengths differ: ${n} vs ${im.length}`)
  if (n === 0 || (n & (n - 1)) !== 0) throw new RangeError(`FFT length must be a power of two, got ${n}`)

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  // Iterative butterflies.
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = (-2 * Math.PI) / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k)
        const wi = Math.sin(step * k)
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** Periodic Hann window of `size` points: 0 at the first point, 1 at the centre. Coherent gain 0.5. */
export function hann(size: number): Float64Array {
  return Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size))
}
