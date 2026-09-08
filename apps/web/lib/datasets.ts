import type { SeriesData } from "./lanes";

// World population estimates, aligned with Our World in Data's historical
// population series (HYDE / UN sources). Values in people, trimmed to the
// timeline's deep-time floor (3000 BCE).
// https://ourworldindata.org/population-growth
export const POPULATION: SeriesData = [
  { year: -3000, value: 14_000_000 },
  { year: -2500, value: 20_000_000 },
  { year: -2000, value: 27_000_000 },
  { year: -1500, value: 40_000_000 },
  { year: -1000, value: 50_000_000 },
  { year: -500, value: 100_000_000 },
  { year: -200, value: 150_000_000 },
  { year: 1, value: 170_000_000 },
  { year: 200, value: 190_000_000 },
  { year: 500, value: 200_000_000 },
  { year: 600, value: 200_000_000 },
  { year: 800, value: 220_000_000 },
  { year: 1000, value: 265_000_000 },
  { year: 1100, value: 320_000_000 },
  { year: 1200, value: 360_000_000 },
  { year: 1300, value: 400_000_000 },
  { year: 1400, value: 350_000_000 },
  { year: 1500, value: 425_000_000 },
  { year: 1600, value: 545_000_000 },
  { year: 1700, value: 610_000_000 },
  { year: 1750, value: 730_000_000 },
  { year: 1800, value: 990_000_000 },
  { year: 1850, value: 1_260_000_000 },
  { year: 1900, value: 1_650_000_000 },
  { year: 1927, value: 2_000_000_000 },
  { year: 1950, value: 2_500_000_000 },
  { year: 1960, value: 3_020_000_000 },
  { year: 1974, value: 4_000_000_000 },
  { year: 1987, value: 5_000_000_000 },
  { year: 1999, value: 6_000_000_000 },
  { year: 2011, value: 7_000_000_000 },
  { year: 2022, value: 8_000_000_000 },
];

export const POPULATION_MIN = Math.min(...POPULATION.map((p) => p.value));
export const POPULATION_MAX = Math.max(...POPULATION.map((p) => p.value));

export function formatPopulation(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)} k`;
  return `${value}`;
}

// Annual global CO2 emissions from fossil fuels and industry, in tonnes.
// https://ourworldindata.org/co2-emissions
export const CO2: SeriesData = [
  { year: -3000, value: 0, estimated: true },
  { year: 1750, value: 10_000_000 },
  { year: 1800, value: 30_000_000 },
  { year: 1850, value: 200_000_000 },
  { year: 1900, value: 2_000_000_000 },
  { year: 1920, value: 3_000_000_000 },
  { year: 1940, value: 4_500_000_000 },
  { year: 1950, value: 6_000_000_000 },
  { year: 1960, value: 9_400_000_000 },
  { year: 1970, value: 14_900_000_000 },
  { year: 1980, value: 19_400_000_000 },
  { year: 1990, value: 22_700_000_000 },
  { year: 2000, value: 25_200_000_000 },
  { year: 2010, value: 33_300_000_000 },
  { year: 2015, value: 35_400_000_000 },
  { year: 2020, value: 34_800_000_000 },
  { year: 2023, value: 37_400_000_000 },
];

export const CO2_MIN = Math.min(...CO2.filter((p) => !p.estimated).map((p) => p.value));
export const CO2_MAX = Math.max(...CO2.filter((p) => !p.estimated).map((p) => p.value));

export function formatCO2(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} Gt`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)} Mt`;
  return `${Math.round(value).toLocaleString("en-US")} t`;
}

// Global average life expectancy at birth, in years.
// https://ourworldindata.org/life-expectancy
export const LIFE_EXPECTANCY: SeriesData = [
  { year: -3000, value: 29, estimated: true },
  { year: 1770, value: 29 },
  { year: 1800, value: 29 },
  { year: 1850, value: 32 },
  { year: 1900, value: 32 },
  { year: 1920, value: 34 },
  { year: 1940, value: 41 },
  { year: 1950, value: 46 },
  { year: 1960, value: 51 },
  { year: 1970, value: 57 },
  { year: 1980, value: 62 },
  { year: 1990, value: 65 },
  { year: 2000, value: 67 },
  { year: 2010, value: 70 },
  { year: 2015, value: 72 },
  { year: 2021, value: 71 },
  { year: 2023, value: 73 },
];

export const LIFE_EXPECTANCY_MIN = Math.min(...LIFE_EXPECTANCY.filter((p) => !p.estimated).map((p) => p.value));
export const LIFE_EXPECTANCY_MAX = Math.max(...LIFE_EXPECTANCY.filter((p) => !p.estimated).map((p) => p.value));

export function formatLifeExpectancy(value: number): string {
  return `${Math.round(value)} yrs`;
}

// Global GDP, constant 2011 international dollars (PPP).
// https://ourworldindata.org/grapher/world-gdp-over-the-last-two-millennia
export const GDP: SeriesData = [
  { year: -3000, value: 1e11, estimated: true },
  { year: 1800, value: 1.2e12 },
  { year: 1850, value: 2.0e12 },
  { year: 1900, value: 3.4e12 },
  { year: 1920, value: 4.7e12 },
  { year: 1940, value: 7.0e12 },
  { year: 1950, value: 9.0e12 },
  { year: 1960, value: 1.4e13 },
  { year: 1970, value: 2.4e13 },
  { year: 1980, value: 3.4e13 },
  { year: 1990, value: 4.6e13 },
  { year: 2000, value: 6.7e13 },
  { year: 2010, value: 9.4e13 },
  { year: 2020, value: 1.29e14 },
  { year: 2023, value: 1.46e14 },
];

export const GDP_MIN = Math.min(...GDP.filter((p) => !p.estimated).map((p) => p.value));
export const GDP_MAX = Math.max(...GDP.filter((p) => !p.estimated).map((p) => p.value));

export function formatGDP(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(0)} T`;
  return `$${(value / 1e9).toFixed(0)} B`;
}
