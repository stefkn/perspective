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

// Map a (time coord, perpendicular offset) pair into world coordinates.
export function timeOffset(
  coord: number,
  perp: number,
  orientation: Orientation,
): [number, number, number] {
  return orientation === "horizontal" ? [coord, perp, 0] : [perp, -coord, 0];
}

// Date <-> fractional-year helpers. The timeline transform is year-based, so
// day-level precision is expressed as a fractional year (e.g. 1969.547 for
// July 20). Pure arithmetic (no `Date`), so years below 100 and BCE are safe.

const DAYS_TO_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function daysInMonth(month: number, leap: boolean): number {
  if (month === 2) return leap ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function dateToFractionalYear(
  year: number,
  month: number,
  day: number,
): number {
  const leap = isLeapYear(year);
  let dayOfYear = DAYS_TO_MONTH[month - 1] + day;
  if (leap && month > 2) dayOfYear += 1;
  return year + (dayOfYear - 1) / daysInYear(year);
}

export function fractionalYearToDate(fractionalYear: number): {
  year: number;
  month: number;
  day: number;
} {
  const year = Math.floor(fractionalYear);
  const leap = isLeapYear(year);
  const total = daysInYear(year);
  let dayOfYear = Math.round((fractionalYear - year) * total) + 1;
  if (dayOfYear < 1) dayOfYear = 1;
  if (dayOfYear > total) dayOfYear = total;

  let month = 1;
  let remaining = dayOfYear;
  while (month < 12 && remaining > daysInMonth(month, leap)) {
    remaining -= daysInMonth(month, leap);
    month++;
  }
  return { year, month, day: remaining };
}

export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatFullDate(fractionalYear: number): string {
  const { year, month, day } = fractionalYearToDate(fractionalYear);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatGap(years: number): string {
  return `${Math.round(years).toLocaleString("en-US")} years`;
}
