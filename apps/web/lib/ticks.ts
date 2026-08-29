import { NOW, yearToCoord, type Scale } from "./time-transform";

export interface Tick {
  year: number;
  coord: number;
  label: string;
  major: boolean;
}

const LINEAR_YEARS: number[] = [];
for (let y = 1850; y <= NOW; y += 25) LINEAR_YEARS.push(y);

const LOG_YEARS: number[] = [
  1800, 1500, 1000, 500, 1, -500, -1000, -2000, -3000,
];

const LINEAR_SCALE_YEARS: number[] = [];
for (let y = -3000; y <= 2000; y += 500) LINEAR_SCALE_YEARS.push(y);

export function generateTicks(scale: Scale): Tick[] {
  if (scale === "linear") {
    return LINEAR_SCALE_YEARS.map((y) => ({
      year: y,
      coord: yearToCoord(y, "linear"),
      label: y > 0 ? `${y}` : y === 0 ? "1 CE" : `${Math.abs(y)} BCE`,
      major: true,
    }));
  }

  const ticks: Tick[] = [];

  for (const y of LINEAR_YEARS) {
    ticks.push({
      year: y,
      coord: yearToCoord(y, "log"),
      label: `${y}`,
      major: y % 100 === 0,
    });
  }

  for (const y of LOG_YEARS) {
    ticks.push({
      year: y,
      coord: yearToCoord(y, "log"),
      label: y > 1 ? `${y}` : y === 1 ? "1" : `${Math.abs(y)} BCE`,
      major: true,
    });
  }

  return ticks;
}
