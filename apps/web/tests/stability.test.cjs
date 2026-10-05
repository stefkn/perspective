const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assignStableLanes, selectKeptIds, displayedMoreCount, resetMoreCounts } = require("../components/lane-layers.ts");
const { selectOtdLabelEvents } = require("../lib/labels.ts");

test("survivors reuse free sparse lanes, including BCE intervals", () => {
  const intervals = [
    { id: "a", startYear: -300, endYear: -200 },
    { id: "b", startYear: -250, endYear: -150 },
    { id: "c", startYear: -100, endYear: -50 },
  ];
  const packed = assignStableLanes(intervals, new Map([["a", 2], ["b", 0], ["c", 1]]));
  assert.deepEqual(packed.map(p => p.lane), [2, 0, 1]);
  const next = assignStableLanes([intervals[2]], new Map([["c", 40]]));
  assert.equal(next[0].lane, 0);
});

test("repeated packing stays bounded and overlapping intervals never share lanes", () => {
  let memory = null;
  for (let frame = 0; frame < 100; frame++) {
    const intervals = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + frame), startYear: i + frame, endYear: i + frame + 5,
    }));
    const packed = assignStableLanes(intervals, memory);
    assert.ok(packed.every(p => p.lane >= 0 && p.lane < intervals.length));
    for (let i = 0; i < packed.length; i++) {
      for (let j = i + 1; j < packed.length; j++) {
        if (packed[i].interval.endYear > packed[j].interval.startYear) {
          assert.notEqual(packed[i].lane, packed[j].lane);
        }
      }
    }
    memory = new Map(packed.map(p => [p.interval.id, p.lane]));
  }
});

test("hysteresis expires incumbents beyond the readable rank budget", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ id: String(i), readable: true }));
  const kept = selectKeptIds(candidates, new Set(["8", "9"]), 2, 2);
  assert.deepEqual([...kept], ["0", "1"]);
  candidates[1].readable = false;
  assert.deepEqual([...selectKeptIds(candidates, new Set(["3"]), 2, 2)], ["0", "2", "3"]);
});

test("on-this-day labels survive panning and fill freed slots", () => {
  const events = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
  const first = selectOtdLabelEvents(events, null, 5);
  const visible = events.filter(e => e.id !== first[0].id);
  const next = selectOtdLabelEvents(visible, new Set(first.map(e => e.id)), 5);
  assert.equal(next.length, 5);
  assert.ok(first.slice(1).every(e => next.includes(e)));
  assert.equal(selectOtdLabelEvents(events, null, 0).length, 0);
});

test("approximate counts remain steady for small changes and reset at zero", () => {
  resetMoreCounts();
  assert.equal(displayedMoreCount("people", 100), 100);
  assert.equal(displayedMoreCount("people", 105), 100);
  assert.equal(displayedMoreCount("people", 130), 130);
  assert.equal(displayedMoreCount("people", 0), 0);
  assert.equal(displayedMoreCount("people", 1), 1);
});
