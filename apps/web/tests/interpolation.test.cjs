const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interpolateSeries } = require("../lib/datasets.ts");
const { ENERGY, ENERGY_SOURCES, interpolateEnergy } = require("../lib/energy.ts");

test("series interpolation handles boundaries, fractional years and estimates", () => {
  const data = [
    { year: 0, value: 0, estimated: true },
    { year: 100, value: 10 },
    { year: 200, value: 30 },
  ];
  assert.deepEqual(interpolateSeries(data, -100), { value: 0, estimated: true });
  assert.deepEqual(interpolateSeries(data, 50), { value: 5, estimated: true });
  assert.deepEqual(interpolateSeries(data, 100), { value: 10, estimated: false });
  assert.deepEqual(interpolateSeries(data, 150.5), { value: 20.1, estimated: false });
  assert.deepEqual(interpolateSeries(data, 300), { value: 30, estimated: false });
  assert.deepEqual(interpolateSeries([], 10), { value: 0, estimated: true });
  assert.equal(interpolateSeries([{ year: 1, value: 2, estimated: true }], 10).estimated, true);
});

test("energy interpolates each source and totals without mutating the dataset", () => {
  const before = JSON.stringify(ENERGY);
  const point = interpolateEnergy(2021.5);
  for (const { id } of ENERGY_SOURCES) {
    assert.equal(point.values[id], (ENERGY.at(-2).values[id] + ENERGY.at(-1).values[id]) / 2);
  }
  assert.equal(point.total, Object.values(point.values).reduce((a, b) => a + b, 0));
  assert.equal(interpolateEnergy(1799).estimated, true);
  assert.equal(interpolateEnergy(1800).estimated, false);
  assert.deepEqual(interpolateEnergy(3000).values, ENERGY.at(-1).values);
  point.values.coal = -1;
  assert.equal(JSON.stringify(ENERGY), before);
});
