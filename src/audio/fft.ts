/** In-place complex radix-2 FFT. Length must be a power of two, else RangeError. */
export function fft(re: Float64Array, im: Float64Array): void {
  // Stub: leaves the input unchanged.
  void re
  void im
}

/** Hann window of `size` points: 0 at both ends, 1 at the centre. */
export function hann(size: number): Float64Array {
  return new Float64Array(size)
}
