const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildBackdropLayers, buildBackdropProbeLayers } = require("../components/lane-layers.ts");
const { LANES, defaultLaneConfigs, isContinuousLane } = require("../lib/lanes.ts");
const { yearToCoord } = require("../lib/time-transform.ts");

test("only continuous lanes default to backdrops", () => {
  const configs = defaultLaneConfigs();
  for (const lane of LANES) assert.equal(configs[lane.id].background, isContinuousLane(lane));
});

for (const orientation of ["horizontal", "vertical"]) {
  for (const scale of ["linear", "log"]) {
    test(`probe markers lie on rendered curves in ${orientation} ${scale} views`, () => {
      const lanes = LANES.filter(isContinuousLane);
      const opts = {
        orientation, scale, timeZoom: 0, coordExtent: [yearToCoord(-3000, scale), 0],
        visibleCoordRange: [yearToCoord(-3000, scale), 0], visiblePerpRange: [-300, 300],
        focusedId: null,
      };
      const layers = buildBackdropLayers(lanes, opts);
      assert.equal(new Set(layers.map(l => l.id)).size, layers.length);
      const year = 1875;
      const coord = yearToCoord(year, scale);
      const probe = buildBackdropProbeLayers(lanes, year, opts);
      const dots = probe.find(l => l.id === "backdrop-probe-dots").props.data;
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i];
        if (lane.kind === "stacked") continue;
        const path = layers.find(l => l.id === `backdrop-${lane.id}-line`).props.data[0].path;
        const time = p => orientation === "horizontal" ? p[0] : -p[1];
        const perp = p => orientation === "horizontal" ? p[1] : p[0];
        const j = path.findIndex((p, j) => j < path.length - 1 && time(p) <= coord && time(path[j + 1]) >= coord);
        assert.ok(j >= 0);
        const a = path[j], b = path[j + 1];
        const t = (coord - time(a)) / (time(b) - time(a));
        const expected = perp(a) + (perp(b) - perp(a)) * t;
        assert.ok(Math.abs(perp(dots[i].position) - expected) < 1e-8);
      }
      assert.deepEqual(buildBackdropLayers(lanes, { ...opts, visiblePerpRange: [0, 0] }), []);
      assert.deepEqual(buildBackdropLayers([], opts), []);
    });
  }
}
