import type { Interval } from "./lanes";

export interface Period extends Interval {}

export const PERIODS: Period[] = [
  { id: "ww1", title: "World War I", startYear: 1914, endYear: 1918 },
  { id: "ww2", title: "World War II", startYear: 1939, endYear: 1945 },
  { id: "interwar", title: "Interwar period", startYear: 1918, endYear: 1939 },
  { id: "cold-war", title: "Cold War", startYear: 1947, endYear: 1991 },
  { id: "space-age", title: "Space Age", startYear: 1957, endYear: 1991 },
  { id: "industrial-rev", title: "Industrial Revolution", startYear: 1760, endYear: 1840 },
];
