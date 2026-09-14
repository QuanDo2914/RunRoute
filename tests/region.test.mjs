import {navigationPath,toGpx} from '../lib/routing/navigation.mjs';
import {snapEndpoint} from "../lib/routing/snap.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { graphFrom, generate, nearest, meters } from "../lib/routing/engine.mjs";
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
      assert.ok(routes.length <= 7);
      const network=new Map(g);const expectedStart=snapEndpoint(network,start,"snap:start");const expectedEnd=endpoint?snapEndpoint(network,endpoint,"snap:end"):expectedStart;
    for (const r of routes) {
        assert.equal(r.ids[0], expectedStart.node.id);
        assert.equal(r.ids.at(-1), expectedEnd.node.id);
        assert.ok(r.distance >= 5000 && r.distance <= 5250);
        assert.equal(r.uTurns,0);
        assert.ok(r.turns <= 15);
        assert.ok(r.nearRetraceFraction <= .03);
        assert.ok(r.maxNearRetraceMeters <= 60);
        assert.ok(r.repeatFraction <= .01);
        assert.ok(Math.abs(navigationPath(r.coordinates).total-r.distance)<.001);
        const exported=[...toGpx(r).matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map(m=>({lat:+m[1],lon:+m[2]}));
        const gpxDistance=exported.reduce((sum,p,i)=>sum+(i?meters(exported[i-1],p):0),0);
        assert.ok(Math.abs(gpxDistance-r.distance)<.5);
        assert.ok(Number.isFinite(r.gain));
        if (avoid) assert.equal(r.signals, 0);
        for (let i = 1; i < r.ids.length; i++)
          assert.ok(network.get(r.ids[i - 1]).edges.some((e) => e.to === r.ids[i]));
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
test('West Main Street address starts on its frontage sidewalk, not Stoughton Alley',()=>{const addresses=JSON.parse(fs.readFileSync(new URL('../public/data/urbana-champaign-addresses.json',import.meta.url))).addresses;const address=addresses.find(a=>a.name==='1004 West Main Street, Urbana, 61801');const snap=snapEndpoint(new Map(g),address,'snap:start');assert.equal(snap.description,'Sidewalk along West Main Street');assert.ok(snap.node.lat<address.lat);assert.ok(snap.distance<20);});
