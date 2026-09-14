import {snapEndpoint} from "./snap.mjs";
import { shapeFeatures, scoreRoute } from "./shape.mjs";
export function meters(a, b) {
  const r = Math.PI / 180,
    p = (b.lat - a.lat) * r,
    q = (b.lon - a.lon) * r;
  return (
    6371000 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(p / 2) ** 2 +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(q / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(p / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(q / 2) ** 2),
      ),
    )
  );
}
export function graphFrom(data) {
  const nodes = new Map(data.nodes.map((n) => [n.id, { ...n, edges: [] }]));
  for (const w of data.ways)
    for (let i = 1; i < w.nodes.length; i++) {
      const a = nodes.get(w.nodes[i - 1]),
        b = nodes.get(w.nodes[i]);
      if (!a || !b) continue;
      const e = {
        length: meters(a, b),
        kind: w.kind,
        footway: w.footway,
        name: w.name,
        key: [a.id, b.id].sort().join(":"),
      };
      if (w.footOneWay !== "-1") a.edges.push({ ...e, to: b.id });
      if (w.footOneWay !== "yes") b.edges.push({ ...e, to: a.id });
    }
  return nodes;
}
export function nearest(g, p, avoid = false) {
  let best = null,
    d = Infinity;
  for (const n of g.values()) {
    if ((avoid && n.signal) || !n.edges.length) continue;
    const m = meters(n, p);
    if (m < d) {
      d = m;
      best = n;
    }
  }
  return { node: best, distance: d };
}
class Heap {
  a = [];
  push(x) {
    let i = this.a.push(x) - 1;
    while (i) {
      let p = (i - 1) >> 1;
      if (this.a[p][0] <= x[0]) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = x;
  }
  pop() {
    const root = this.a[0],
      x = this.a.pop();
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++;
        if (this.a[c][0] >= x[0]) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = x;
    }
    return root;
  }
}
export function shortest(g, start, end, avoid = false, used = new Set()) {
  const h = new Heap();
  h.push([0, start]);
  const costs = new Map([[start, 0]]),
    prev = new Map();
  while (h.a.length) {
    const [cost, id] = h.pop();
    if (cost !== costs.get(id)) continue;
    if (id === end) {
      let ids = [end];
      while (ids[0] !== start) ids.unshift(prev.get(ids[0]));
      return ids;
    }
    for (const e of g.get(id).edges) {
      if (avoid && g.get(e.to).signal) continue;
      const factor = ["path", "footway", "pedestrian", "track"].includes(e.kind)
        ? 0.9
        : 1.1;
      const c = cost + e.length * factor * (used.has(e.key) ? 4 : 1);
      if (c < (costs.get(e.to) ?? Infinity)) {
        costs.set(e.to, c);
        prev.set(e.to, id);
        h.push([c, e.to]);
      }
    }
  }
  return null;
}
export function features(g, ids, target) {
  let distance = 0,
    trails = 0,
    repeated = 0,
    gain = 0;
  const seen = new Set(),
    signals = new Set();
  let elevationKnown = true;
  for (let i = 0; i < ids.length; i++) {
    const n = g.get(ids[i]);
    if (n.signal) signals.add(n.id);
    if (n.elevation == null) elevationKnown = false;
    if (!i) continue;
    const p = g.get(ids[i - 1]),
      e = p.edges.find((e) => e.to === n.id);
    distance += e.length;
    if (["path", "footway", "pedestrian", "track"].includes(e.kind))
      trails += e.length;
    if (seen.has(e.key)) repeated += e.length;
    seen.add(e.key);
    if (n.elevation != null && p.elevation != null)
      gain += Math.max(0, n.elevation - p.elevation);
  }
  return {
    distance,
    trailFraction: trails / distance,
    repeatFraction: repeated / distance,
    signals: signals.size,
    gain: elevationKnown ? gain : null,
    distanceError: Math.abs(distance - target) / target,
  };
}
export function generate(g, request) {
  const { start, end, target, avoid = false, terrain = "flat" } = request;
  if (
    !start ||
    ![start.lat, start.lon, ...(end ? [end.lat, end.lon] : [])].every(
      Number.isFinite,
    )
  )
    throw Error("Choose valid map coordinates.");
  if (!Number.isFinite(target) || target < 1000 || target > 25000)
    throw Error("Choose a distance between 1 and 25 km.");
  g=new Map(g);
  const s=snapEndpoint(g,start,"snap:start"),
    t=end?snapEndpoint(g,end,"snap:end"):s;
  if (end && s.node?.id === t.node?.id)
    throw Error("Choose a different destination, or switch to a loop.");
  if (s.distance > 200 || t.distance > 200)
    throw Error(
      "Choose a location within 200 m of a mapped running road or path.",
    );
  if (avoid && (s.node.signal || t.node.signal))
    throw Error(
      "Your endpoint is at a mapped traffic light. Move the pin slightly to avoid it.",
    );
  const candidates = [],
    signatures = new Set(),
    points = [...g.values()];
  function add(stops) {
    let ids = [s.node.id],
      used = new Set();
    for (const stop of stops) {
      const part = shortest(g, ids.at(-1), stop, avoid, used);
      if (!part) return;
      for (let i = 1; i < part.length; i++)
        used.add([part[i - 1], part[i]].sort().join(":"));
      ids.push(...part.slice(1));
    }
    if (ids.length < 3) return;
    const coordinates = ids.map((id) => [g.get(id).lat, g.get(id).lon]);
    const f = { ...features(g, ids, target), ...shapeFeatures(coordinates) };
    if (f.distanceError > 0.25) return;
    const signature = [...used].sort().join(",");
    if (signatures.has(signature)) return;
    signatures.add(signature);
    const { score, rankScore, shapePenaltyPoints } = scoreRoute(f, terrain);
    candidates.push({
      ids,
      ...f,
      score,
      rankScore,
      shapePenaltyPoints,
      coordinates,
      snapStart: s.distance,
      snapEnd: t.distance,
      startLocation:{lat:s.node.lat,lon:s.node.lon,description:s.description},
      endLocation:{lat:t.node.lat,lon:t.node.lon,description:t.description},
    });
  }
  if (end) add([t.node.id]);
  for (let k = 0; k < 36; k++) {
    const angle = (k * Math.PI * 2) / 12,
      radius = (target / (end ? 4 : 5.8)) * [0.75, 1, 1.2][Math.floor(k / 12)];
    const center = end
      ? { lat: (start.lat + end.lat) / 2, lon: (start.lon + end.lon) / 2 }
      : start;
    const waypoint = (a) =>
      nearest(
        g,
        {
          lat: center.lat + (Math.cos(a) * radius) / 111320,
          lon:
            center.lon +
            (Math.sin(a) * radius) /
              (111320 * Math.cos((center.lat * Math.PI) / 180)),
        },
        avoid,
      ).node.id;
    const a = waypoint(angle),
      b = waypoint(angle + Math.PI * 0.65);
    add(end ? [a, t.node.id] : [a, b, s.node.id]);
  }
  candidates.sort((a, b) => b.rankScore - a.rankScore);
  const diverse = [];
  for (const c of candidates) {
    const set = new Set(c.ids);
    if (
      diverse.every(
        (d) =>
          d.ids.filter((id) => set.has(id)).length /
            Math.max(c.ids.length, d.ids.length) <
          0.85,
      )
    )
      diverse.push(c);
    if (diverse.length === 3) break;
  }
  return diverse;
}
