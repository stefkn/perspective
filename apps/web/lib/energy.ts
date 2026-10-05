export type EnergySourceId =
  | "coal"
  | "oil"
  | "gas"
  | "nuclear"
  | "hydro"
  | "wind"
  | "solar"
  | "other";

export interface EnergySource {
  id: EnergySourceId;
  label: string;
  color: [number, number, number];
}

// Colors follow Our World in Data's "Global primary energy consumption by
// source" palette for continuity.
export const ENERGY_SOURCES: EnergySource[] = [
  { id: "coal", label: "Coal", color: [136, 48, 57] },
  { id: "oil", label: "Oil", color: [76, 106, 156] },
  { id: "gas", label: "Gas", color: [221, 132, 86] },
  { id: "nuclear", label: "Nuclear", color: [229, 110, 90] },
  { id: "hydro", label: "Hydro", color: [109, 131, 182] },
  { id: "wind", label: "Wind", color: [127, 176, 105] },
  { id: "solar", label: "Solar", color: [228, 176, 0] },
  { id: "other", label: "Other renewables", color: [150, 150, 150] },
];

export interface EnergyPoint {
  year: number;
  values: Record<EnergySourceId, number>;
  estimated?: boolean;
}

// Global primary energy consumption by source, in TWh. Approximate values
// aligned with Our World in Data (Energy Institute Statistical Review).
// https://ourworldindata.org/grapher/global-primary-energy-by-source
export const ENERGY: EnergyPoint[] = [
  { year: -3000, values: { coal: 0, oil: 0, gas: 0, nuclear: 0, hydro: 0, wind: 0, solar: 0, other: 0 }, estimated: true },
  { year: 1800, values: { coal: 100, oil: 0, gas: 0, nuclear: 0, hydro: 0, wind: 0, solar: 0, other: 0 } },
  { year: 1850, values: { coal: 800, oil: 0, gas: 0, nuclear: 0, hydro: 0, wind: 0, solar: 0, other: 0 } },
  { year: 1900, values: { coal: 6000, oil: 200, gas: 0, nuclear: 0, hydro: 20, wind: 0, solar: 0, other: 0 } },
  { year: 1920, values: { coal: 9000, oil: 1800, gas: 300, nuclear: 0, hydro: 100, wind: 0, solar: 0, other: 0 } },
  { year: 1940, values: { coal: 11000, oil: 4000, gas: 1000, nuclear: 0, hydro: 350, wind: 0, solar: 0, other: 0 } },
  { year: 1960, values: { coal: 14000, oil: 8000, gas: 4000, nuclear: 20, hydro: 900, wind: 0, solar: 0, other: 0 } },
  { year: 1980, values: { coal: 19000, oil: 30000, gas: 12000, nuclear: 2000, hydro: 1800, wind: 0, solar: 0, other: 0 } },
  { year: 2000, values: { coal: 25000, oil: 36000, gas: 20000, nuclear: 6800, hydro: 2600, wind: 50, solar: 10, other: 300 } },
  { year: 2010, values: { coal: 34000, oil: 45000, gas: 28000, nuclear: 7200, hydro: 3300, wind: 900, solar: 100, other: 600 } },
  { year: 2015, values: { coal: 36000, oil: 51000, gas: 34000, nuclear: 7000, hydro: 3800, wind: 2300, solar: 1000, other: 1000 } },
  { year: 2020, values: { coal: 37000, oil: 48000, gas: 37000, nuclear: 7000, hydro: 4200, wind: 3400, solar: 2400, other: 1300 } },
  { year: 2023, values: { coal: 44000, oil: 52000, gas: 40000, nuclear: 6900, hydro: 4200, wind: 4600, solar: 3800, other: 1500 } },
];

export const ENERGY_MIN = 0;

export const ENERGY_MAX = Math.max(
  ...ENERGY.map((p) =>
    ENERGY_SOURCES.reduce((sum, s) => sum + p.values[s.id], 0),
  ),
);

export function formatEnergy(value: number): string {
  if (value >= 1e5) return `${Math.round(value / 1e3)} PWh`;
  if (value >= 1e3) return `${Math.round(value / 1e3)} k TWh`;
  return `${Math.round(value)} TWh`;
}

// Linear per-source interpolation of the stacked energy series at an
// arbitrary (possibly fractional) year, plus the summed total. Clamps to the
// edge values outside the data range. `estimated` is true while the year
// predates the first measured point.
export function interpolateEnergy(year: number): {
  total: number;
  values: Record<EnergySourceId, number>;
  estimated: boolean;
} {
  const at = (idx: number): Record<EnergySourceId, number> => ({
    ...ENERGY[idx].values,
  });
  const firstRealIndex = ENERGY.findIndex((p) => !p.estimated);
  const firstRealYear =
    firstRealIndex >= 0 ? ENERGY[firstRealIndex].year : Infinity;
  const blend = (
    a: Record<EnergySourceId, number>,
    b: Record<EnergySourceId, number>,
    t: number,
  ): Record<EnergySourceId, number> => {
    const out = {} as Record<EnergySourceId, number>;
    for (const s of ENERGY_SOURCES) {
      out[s.id] = a[s.id] + (b[s.id] - a[s.id]) * t;
    }
    return out;
  };
  if (year <= ENERGY[0].year) {
    const values = at(0);
    return {
      total: ENERGY_SOURCES.reduce((sum, s) => sum + values[s.id], 0),
      values,
      estimated: year < firstRealYear,
    };
  }
  const last = ENERGY[ENERGY.length - 1];
  if (year >= last.year) {
    const values = at(ENERGY.length - 1);
    return {
      total: ENERGY_SOURCES.reduce((sum, s) => sum + values[s.id], 0),
      values,
      estimated: year < firstRealYear,
    };
  }
  for (let i = 0; i < ENERGY.length - 1; i++) {
    const a = ENERGY[i];
    const b = ENERGY[i + 1];
    if (year >= a.year && year <= b.year) {
      const span = b.year - a.year;
      const t = span > 0 ? (year - a.year) / span : 0;
      const values = blend(a.values, b.values, t);
      return {
        total: ENERGY_SOURCES.reduce((sum, s) => sum + values[s.id], 0),
        values,
        estimated: year < firstRealYear,
      };
    }
  }
  const values = at(ENERGY.length - 1);
  return {
    total: ENERGY_SOURCES.reduce((sum, s) => sum + values[s.id], 0),
    values,
    estimated: year < firstRealYear,
  };
}
