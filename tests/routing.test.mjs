import test from "node:test";
import assert from "node:assert/strict";
import {
  graphFrom,
  shortest,
  features,
  generate,
  meters,
} from "../lib/routing/engine.mjs";
const fixture = {
  nodes: [
    { id: 1, lat: 40, lon: -88, elevation: 200 },
    { id: 2, lat: 40.001, lon: -88, elevation: 205, signal: true },
    { id: 3, lat: 40.001, lon: -88.001, elevation: 202 },
    { id: 4, lat: 40, lon: -88.001, elevation: 200 },
    { id: 5, lat: 41, lon: -89, elevation: null },
  ],
  ways: [
    { nodes: [1, 2, 3], kind: "residential" },
    { nodes: [1, 4, 3], kind: "footway" },
  ],
};
test("signal exclusion chooses a connected alternative", () => {
  const g = graphFrom(fixture);
  const path = shortest(g, 1, 3, true);
  assert.deepEqual(path, [1, 4, 3]);
  assert.equal(features(g, path, 200).signals, 0);
});
test("unreachable destination returns null", () =>
  assert.equal(shortest(graphFrom(fixture), 1, 5), null));
test("pedestrian one-way is respected", () => {
  const g = graphFrom({
    nodes: fixture.nodes,
    ways: [{ nodes: [1, 2], kind: "footway", footOneWay: "yes" }],
  });
  assert.deepEqual(shortest(g, 1, 2), [1, 2]);
  assert.equal(shortest(g, 2, 1), null);
});
test("distance and repeats are measured on the traversed geometry", () => {
  const g = graphFrom(fixture),
    f = features(g, [1, 2, 1], 200);
  assert.ok(Math.abs(f.distance - 222.39) < 1);
  assert.equal(f.repeatFraction, 0.5);
  assert.equal(f.signals, 1);
  assert.equal(f.gain, 5);
});
test("unknown elevation stays unknown", () => {
  const f = structuredClone(fixture);
  f.nodes[1].elevation = null;
  assert.equal(features(graphFrom(f), [1, 2], 100).gain, null);
});
test("invalid distance and far-away start fail intentionally", () => {
  const g = graphFrom(fixture);
  assert.throws(() => generate(g, { start: fixture.nodes[0], target: NaN }));
  assert.throws(() => generate(g, { start: { lat: 0, lon: 0 }, target: 5000 }));
});
import { shapeFeatures, scoreRoute } from "../lib/routing/shape.mjs";
const ll = (points) =>
  points.map(([x, y]) => [
    40 + y / 111320,
    -88 + x / (111320 * Math.cos((40 * Math.PI) / 180)),
  ]);
test("an immediate U-turn lowers the score", () => {
  const smooth = shapeFeatures(
    ll([
      [0, 0],
      [0, 300],
      [300, 300],
      [300, 0],
      [0, 0],
    ]),
  );
  const reverse = shapeFeatures(
    ll([
      [0, 0],
      [0, 300],
      [0, 0],
    ]),
  );
  assert.equal(smooth.uTurns, 0);
  assert.equal(smooth.nearRetraceFraction, 0);
  assert.ok(reverse.uTurns >= 1);
  assert.ok(reverse.nearRetraceFraction > 0.3);
  const base = {
    distance: 5000,
    gain: 0,
    distanceError: 0,
    repeatFraction: 0,
    signals: 0,
    trailFraction: 1,
  };
  assert.ok(
    scoreRoute({ ...base, ...reverse }).score <
      scoreRoute({ ...base, ...smooth }).score,
  );
});
test("opposite nearby paths count as doubling back even with different geometry", () => {
  const f = shapeFeatures(
    ll([
      [0, 0],
      [0, 300],
      [10, 300],
      [10, 0],
    ]),
  );
  assert.ok(f.nearRetraceFraction > 0.3);
});
test("ordinary right angle streets and separated parallel roads are not reversals", () => {
  const f = shapeFeatures(
    ll([
      [0, 0],
      [0, 300],
      [200, 300],
      [200, 0],
    ]),
  );
  assert.equal(f.uTurns, 0);
  assert.equal(f.nearRetraceFraction, 0);
});
test("terrain changes ranking in the intended direction", () => {
  const f = {
    distance: 5000,
    distanceError: 0,
    repeatFraction: 0,
    signals: 0,
    trailFraction: 1,
    uTurns: 0,
    nearRetraceFraction: 0,
  };
  assert.ok(
    scoreRoute({ ...f, gain: 0 }, "flat").score >
      scoreRoute({ ...f, gain: 50 }, "flat").score,
  );
  assert.ok(
    scoreRoute({ ...f, gain: 50 }, "hilly").score >
      scoreRoute({ ...f, gain: 0 }, "hilly").score,
  );
});
test("fewer ordinary turns and lights always improve the unrounded rank", () => {
  const f = {
    distance: 5000,
    gain: 0,
    distanceError: 0,
    repeatFraction: 0,
    nearRetraceFraction: 0,
    uTurns: 0,
    turns: 12,
    signals: 3,
    trailFraction: 1,
  };
  assert.ok(
    scoreRoute({ ...f, turns: 11 }).rankScore > scoreRoute(f).rankScore,
  );
  assert.ok(
    scoreRoute({ ...f, signals: 2 }).rankScore > scoreRoute(f).rankScore,
  );
  assert.ok(
    shapeFeatures(
      ll([
        [0, 0],
        [0, 300],
        [100, 300],
        [100, 0],
      ]),
    ).turns >= 2,
  );
});

test("narrow U-shaped street detours also receive a return penalty",()=>{const shape=shapeFeatures(ll([[0,0],[0,500],[80,500],[80,0]]));assert.ok(shape.nearRetraceFraction>.25);});
import {snapEndpoint} from '../lib/routing/snap.mjs';
test('address frontage beats a closer rear alley and snaps between vertices',()=>{
 const nodes=[{id:1,lat:40,lon:-88.002},{id:2,lat:40,lon:-87.998},{id:3,lat:40.001,lon:-88.002},{id:4,lat:40.001,lon:-87.998}];
 const original=graphFrom({nodes,ways:[{nodes:[1,2],kind:'residential',name:'West Main Street'},{nodes:[3,4],kind:'service',name:'Stoughton Alley'}]});
 const g=new Map(original),p={lat:40.0008,lon:-88,name:'1004 West Main Street, Urbana'};const s=snapEndpoint(g,p,'snap:start');
 assert.ok(Math.abs(s.node.lat-40)<1e-8);assert.ok(Math.abs(s.node.lon+88)<1e-8);assert.equal(s.description,'West Main Street');assert.ok(shortest(g,1,2).includes('snap:start'));assert.deepEqual(shortest(original,1,2),[1,2]);
});
test('splitting a one-way segment preserves direction and supports two endpoints',()=>{const g=graphFrom({nodes:[{id:1,lat:40,lon:-88},{id:2,lat:40.01,lon:-88}],ways:[{nodes:[1,2],kind:'footway',footOneWay:'yes'}]});const a=snapEndpoint(g,{lat:40.002,lon:-88},'a');const b=snapEndpoint(g,{lat:40.008,lon:-88},'b');assert.deepEqual(shortest(g,'a','b'),['a','b']);assert.equal(shortest(g,'b','a'),null);assert.equal(g.get(1).edges[0].to,'a');});
