export const LOD_MIN_SPAN_YEARS = 40;
export const LOD_MAX_SPAN_YEARS = 6000;
export const LOD_MAX_MIN_SIG = 0.6;
export const FADE_WINDOW = 0.15;

export function spanToMinSignificance(spanYears: number): number {
  const span = Math.min(Math.max(spanYears, LOD_MIN_SPAN_YEARS), LOD_MAX_SPAN_YEARS);
  if (span <= LOD_MIN_SPAN_YEARS) return 0;
  if (span >= LOD_MAX_SPAN_YEARS) return LOD_MAX_MIN_SIG;
  const t =
    Math.log(span / LOD_MIN_SPAN_YEARS) /
    Math.log(LOD_MAX_SPAN_YEARS / LOD_MIN_SPAN_YEARS);
  return t * LOD_MAX_MIN_SIG;
}

export function opacityForSignificance(sig: number, minSig: number): number {
  if (sig >= minSig + FADE_WINDOW) return 1;
  if (sig <= minSig) return 0;
  return (sig - minSig) / FADE_WINDOW;
}

export function significanceColor(
  sig: number,
  alpha = 1,
): [number, number, number, number] {
  const low = [0x3a, 0x40, 0x4b];
  const high = [0xff, 0xd1, 0x66];
  const c = low.map((l, i) => Math.round(l + (high[i] - l) * sig));
  return [c[0], c[1], c[2], Math.round(alpha * 255)];
}
