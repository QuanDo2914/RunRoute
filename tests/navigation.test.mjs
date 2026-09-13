import test from "node:test";
import assert from "node:assert/strict";
import {
  navigationPath,
  navigationUpdate,
  matchProgress,
  toGpx,
} from "../lib/routing/navigation.mjs";
import {
  normalizeAddress,
  searchAddresses,
} from "../lib/routing/address-search.mjs";
const ll = ([x, y]) => [
  40 + y / 111320,
  -88 + x / (111320 * Math.cos((40 * Math.PI) / 180)),
];
const pos = (x, y, accuracy = 5) => {
  const [lat, lon] = ll([x, y]);
  return { lat, lon, accuracy };
};
const route = navigationPath(
  [
    [0, 0],
    [0, 300],
    [300, 300],
    [300, 0],
    [0, 0],
  ].map(ll),
);
test("loop start does not snap to the finish", () => {
  const s = navigationUpdate(route, pos(0, 0));
  assert.equal(s.status, "on-route");
  assert.ok(s.progress < 1);
  assert.ok(s.remaining > 1000);
});
test("GPS sequence progresses and completes the loop only at the end", () => {
  let previous = 0,
    acquired = false,
    last;
  for (const p of [
    [0, 0],
    [0, 100],
    [0, 200],
    [0, 300],
    [100, 300],
    [200, 300],
    [300, 300],
    [300, 200],
    [300, 100],
    [300, 0],
    [200, 0],
    [100, 0],
    [0, 0],
  ]) {
    last = navigationUpdate(route, pos(...p), previous, acquired);
    assert.ok(last.progress >= previous);
    previous = last.progress;
    acquired = last.acquired;
  }
  assert.equal(last.status, "finished");
});
test("off-route and poor accuracy do not invent progress", () => {
  const off = navigationUpdate(route, pos(-100, 100), 50, true);
  assert.equal(off.status, "off-route");
  assert.equal(off.progress, 50);
  const weak = navigationUpdate(route, pos(0, 200, 150), 50, true);
  assert.equal(weak.status, "weak-gps");
  assert.equal(weak.progress, 50);
});
test("navigation requests reaching the actual start", () =>
  assert.equal(navigationUpdate(route, pos(300, 300)).status, "to-start"));
test("turns distinguish left from right", () => {
  assert.equal(route.turns[0].instruction, "Turn right");
  const left = navigationPath(
    [
      [0, 0],
      [0, 100],
      [-100, 100],
    ].map(ll),
  );
  assert.equal(left.turns[0].instruction, "Turn left");
});
test("GPX preserves coordinates and escapes user-visible text", () => {
  const coordinates = [
    [40.1, -88.2],
    [40.2, -88.3],
  ];
  const gpx = toGpx({ coordinates }, 'Run <A> & "B"');
  assert.match(gpx, /version="1.1"/);
  assert.match(gpx, /Run &lt;A&gt; &amp; &quot;B&quot;/);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 2);
  assert.match(gpx, /lat="40.1000000" lon="-88.2000000"/);
  assert.throws(() => toGpx({ coordinates: [[NaN, 2]] }));
});
test("address search matches street abbreviations and exact house numbers", () => {
  const records = [
    { name: "200 West Green Street, Champaign", lat: 40.1, lon: -88.2 },
    { name: "1200 West Green Street, Urbana", lat: 40.1, lon: -88.2 },
  ];
  assert.equal(
    searchAddresses(records, "200 W Green St")[0].name,
    records[0].name,
  );
  assert.equal(searchAddresses(records, "200 W Green St").length, 1);
  assert.equal(searchAddresses(records, "999 nowhere street").length, 0);
});
