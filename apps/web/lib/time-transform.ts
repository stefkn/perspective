export const NOW = new Date().getFullYear();

export const HINGE_YEARS_AGO = 200;
export const PIXELS_PER_LINEAR_YEAR = 4;
export const LOG_BASE = 10;
export const LOG_PIXELS_PER_DECADE = PIXELS_PER_LINEAR_YEAR * 8;

export type Scale = "log" | "linear";

export function yearsAgo(year: number): number {
  return NOW - year;
}

export function yearToCoord(year: number, scale: Scale = "log"): number {
  const ya = yearsAgo(year);
  if (scale === "linear") {
    return -ya * PIXELS_PER_LINEAR_YEAR;
  }
  if (ya <= HINGE_YEARS_AGO) {
    return -ya * PIXELS_PER_LINEAR_YEAR;
  }
  const hingeX = -HINGE_YEARS_AGO * PIXELS_PER_LINEAR_YEAR;
  const logExtra = Math.log(ya - HINGE_YEARS_AGO + 1) / Math.log(LOG_BASE);
  return hingeX - logExtra * LOG_PIXELS_PER_DECADE;
}

export function coordToYear(coord: number, scale: Scale = "log"): number {
  if (scale === "linear") {
    return NOW + coord / PIXELS_PER_LINEAR_YEAR;
  }
  const hingeX = -HINGE_YEARS_AGO * PIXELS_PER_LINEAR_YEAR;
  if (coord >= hingeX) {
    return NOW + coord / PIXELS_PER_LINEAR_YEAR;
  }
  const logExtra = (hingeX - coord) / LOG_PIXELS_PER_DECADE;
  const ya = HINGE_YEARS_AGO + (Math.pow(LOG_BASE, logExtra) - 1);
  return NOW - ya;
}

export type Orientation = "horizontal" | "vertical";

export function coordToWorld(
  coord: number,
  orientation: Orientation,
): [number, number, number] {
  return orientation === "horizontal" ? [coord, 0, 0] : [0, -coord, 0];
}

export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
}

export function formatGap(years: number): string {
  return `${Math.round(years).toLocaleString("en-US")} years`;
}
