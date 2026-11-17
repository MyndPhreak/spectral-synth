import { notImplemented } from './model'

/** In-place complex radix-2 FFT. Length must be a power of two, else RangeError. */
export function fft(re: Float64Array, im: Float64Array): void {
  notImplemented(re, im)
}

/** Hann window of `size` points: 0 at both ends, 1 at the centre. */
export function hann(size: number): Float64Array {
  return notImplemented(size)
}
