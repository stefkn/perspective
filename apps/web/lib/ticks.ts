import {
  NOW,
  yearToCoord,
  coordToYear,
  HINGE_YEARS_AGO,
  PIXELS_PER_LINEAR_YEAR,
  dateToFractionalYear,
  fractionalYearToDate,
  type Scale,
} from "./time-transform";

export interface Tick {
  year: number;
  coord: number;
  label: string;
  major: boolean;
}

// Minimum screen spacing (in px) between labeled ticks. The finer the step,
// the denser the axis; this keeps each zoom level readable instead of piling
// labels on top of each other.
const MIN_MAJOR_PX = 80;

// Nice year steps, ordered coarse -> fine. The 1-2-5 ladder keeps tick values
// round; 25 is included so recent history keeps its quarter-century feel.
const YEAR_STEPS = [2000, 1000, 500, 200, 100, 50, 25, 20, 10, 5, 2, 1];

// Month-level steps (months between labeled ticks), ordered fine -> coarse.
const MONTH_STEPS = [1, 2, 3, 4, 6];

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// The "linear" portion of the log scale: years within HINGE_YEARS_AGO of now
// are spaced evenly, everything older is compressed logarithmically.
const HINGE_YEAR = NOW - HINGE_YEARS_AGO;

// Curated major ticks for the logarithmic (deep-time) region of the log scale.
const LOG_YEARS = [1800, 1500, 1000, 500, 1, -500, -1000, -2000, -3000];

function formatYearLabel(year: number): string {
  if (year > 0) return `${year}`;
  if (year === 0) return "1 CE";
  return `${Math.abs(year)} BCE`;
}

// "Sep 1995"-style label for a fractional year, used both by the month ticks
// and by the pinned label that keeps a month+year visible at extreme zoom.
export function monthYearLabel(fractionalYear: number): string {
  const { year, month } = fractionalYearToDate(fractionalYear);
  return `${MONTH_ABBR[month - 1]} ${formatYearLabel(year)}`;
}

// Sub-step for the unlabeled minor tick marks inside a labeled year step,
// following the 1-2-5 scheme (e.g. 100 -> 20, 20 -> 5, 50 -> 10).
function minorStepYears(step: number): number {
  const lead = step / 10 ** Math.floor(Math.log10(step));
  return lead === 2 ? step / 4 : step / 5;
}

type Step =
  | { kind: "years"; value: number }
  | { kind: "months"; monthsPer: number };

// Pick the finest step whose on-screen spacing still clears MIN_MAJOR_PX.
// Zooming in shrinks the step through centuries -> decades -> years -> months.
function chooseStep(ppx: number): Step {
  for (const monthsPer of MONTH_STEPS) {
    if ((monthsPer / 12) * ppx >= MIN_MAJOR_PX) {
      return { kind: "months", monthsPer };
    }
  }
  for (let i = YEAR_STEPS.length - 1; i >= 0; i--) {
    const value = YEAR_STEPS[i];
    if (value * ppx >= MIN_MAJOR_PX) return { kind: "years", value };
  }
  return { kind: "years", value: YEAR_STEPS[0] };
}

function generateYearTicks(
  loYear: number,
  hiYear: number,
  step: number,
  scale: Scale,
): Tick[] {
  const minor = minorStepYears(step);
  const base = minor >= 1 && minor < step ? minor : step;
  const start = Math.ceil(loYear / base) * base;
  const ticks: Tick[] = [];
  for (let y = start; y <= hiYear + 1e-9; y += base) {
    const major = y % step === 0;
    ticks.push({
      year: y,
      coord: yearToCoord(y, scale),
      label: major ? formatYearLabel(y) : "",
      major,
    });
  }
  return ticks;
}

function generateMonthTicks(
  loYear: number,
  hiYear: number,
  monthsPer: number,
  scale: Scale,
): Tick[] {
  const ticks: Tick[] = [];
  for (let y = Math.floor(loYear); y <= Math.ceil(hiYear); y++) {
    for (let m = 1; m <= 12; m += monthsPer) {
      const fy = dateToFractionalYear(y, m, 1);
      if (fy < loYear - 1e-9 || fy > hiYear + 1e-9) continue;
      const isYear = m === 1;
      ticks.push({
        year: fy,
        coord: yearToCoord(fy, scale),
        label: `${MONTH_ABBR[m - 1]} ${formatYearLabel(y)}`,
        major: isYear,
      });
    }
  }
  return ticks;
}

function generateLogRegionTicks(loYear: number, hiYear: number): Tick[] {
  const ticks: Tick[] = [];
  for (const y of LOG_YEARS) {
    if (y < loYear || y > hiYear) continue;
    ticks.push({
      year: y,
      coord: yearToCoord(y, "log"),
      label: formatYearLabel(y),
      major: true,
    });
  }
  return ticks;
}

export function generateTicks(
  scale: Scale,
  zoom: number,
  range: [number, number] | null,
  coordExtent: [number, number],
): Tick[] {
  if (!range) return [];
  const lo = Math.max(range[0], coordExtent[0]);
  const hi = Math.min(range[1], coordExtent[1]);
  if (hi <= lo) return [];

  const loYear = coordToYear(lo, scale);
  const hiYear = coordToYear(hi, scale);
  const ppx = PIXELS_PER_LINEAR_YEAR * Math.pow(2, zoom);
  const step = chooseStep(ppx);

  const ticks: Tick[] = [];

  if (scale === "log") {
    const recentLo = Math.max(loYear, HINGE_YEAR);
    if (recentLo <= hiYear) {
      if (step.kind === "years") {
        ticks.push(...generateYearTicks(recentLo, hiYear, step.value, scale));
      } else {
        ticks.push(...generateMonthTicks(recentLo, hiYear, step.monthsPer, scale));
      }
    }
    ticks.push(...generateLogRegionTicks(loYear, Math.min(hiYear, HINGE_YEAR)));
  } else if (step.kind === "years") {
    ticks.push(...generateYearTicks(loYear, hiYear, step.value, scale));
  } else {
    ticks.push(...generateMonthTicks(loYear, hiYear, step.monthsPer, scale));
  }

  ticks.sort((a, b) => a.coord - b.coord);
  return ticks;
}
