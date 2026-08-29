export interface Period {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
}

export const PERIODS: Period[] = [
  { id: "ww1", title: "World War I", startYear: 1914, endYear: 1918 },
  { id: "ww2", title: "World War II", startYear: 1939, endYear: 1945 },
  { id: "interwar", title: "Interwar period", startYear: 1918, endYear: 1939 },
  { id: "cold-war", title: "Cold War", startYear: 1947, endYear: 1991 },
  { id: "roman-empire", title: "Roman Empire", startYear: -27, endYear: 476 },
  { id: "mongol-empire", title: "Mongol Empire", startYear: 1206, endYear: 1368 },
  { id: "space-age", title: "Space Age", startYear: 1957, endYear: 1991 },
  { id: "industrial-rev", title: "Industrial Revolution", startYear: 1760, endYear: 1840 },
];

export interface PeriodLane {
  period: Period;
  lane: number;
}

export function assignPeriodLanes(periods: Period[]): PeriodLane[] {
  const sorted = [...periods].sort(
    (a, b) => a.startYear - b.startYear || a.endYear - b.endYear,
  );

  const laneEnds: number[] = [];
  const result: PeriodLane[] = [];

  for (const period of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > period.startYear) {
      lane++;
    }
    if (lane === laneEnds.length) laneEnds.push(0);
    laneEnds[lane] = period.endYear;
    result.push({ period, lane });
  }

  return result;
}

export function laneOffset(lane: number, thickness: number): number {
  const direction = lane % 2 === 0 ? -1 : 1;
  const level = Math.floor(lane / 2);
  return direction * (thickness / 2 + 6 + level * 16);
}
