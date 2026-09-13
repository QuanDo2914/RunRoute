import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { graphFrom, generate, nearest } from "../lib/routing/engine.mjs";
const data = JSON.parse(
  fs.readFileSync(
    new URL("../public/data/urbana-champaign.json", import.meta.url),
  ),
);
const g = graphFrom(data);
const start = { lat: 40.1075, lon: -88.2272 },
  end = { lat: 40.083, lon: -88.2072 };
for (const avoid of [false, true])
  for (const endpoint of [null, end])
    test(`${endpoint ? "point-to-point" : "loop"} real network, avoid=${avoid}`, () => {
      const routes = generate(g, { start, end: endpoint, target: 5000, avoid });
      assert.ok(routes.length > 0);
      for (const r of routes) {
        assert.equal(r.ids[0], nearest(g, start).node.id);
        assert.equal(r.ids.at(-1), nearest(g, endpoint || start).node.id);
        assert.ok(r.distanceError <= 0.25);
        assert.ok(Number.isFinite(r.gain));
        if (avoid) assert.equal(r.signals, 0);
        for (let i = 1; i < r.ids.length; i++)
          assert.ok(g.get(r.ids[i - 1]).edges.some((e) => e.to === r.ids[i]));
        for (const [lat, lon] of r.coordinates)
          assert.ok(
            lat >= data.bounds[0] &&
              lat <= data.bounds[2] &&
              lon >= data.bounds[1] &&
              lon <= data.bounds[3],
          );
      }
    });
test("regional snapshot contains attribution and real elevations", () => {
  assert.ok(data.timestamp);
  assert.ok(data.source.includes("OpenStreetMap"));
  assert.ok(data.nodes.length > 1000);
  assert.ok(data.nodes.every((n) => Number.isFinite(n.elevation)));
});
