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
function bendCost(previous,n,next) {
  if(!previous) return 0;
  const scale=Math.cos(n.lat*Math.PI/180);
  const ax=(n.lon-previous.lon)*scale,ay=n.lat-previous.lat;
  const bx=(next.lon-n.lon)*scale,by=next.lat-n.lat;
  const size=Math.hypot(ax,ay)*Math.hypot(bx,by);
  const dot=size?Math.max(-1,Math.min(1,(ax*bx+ay*by)/size)):1;
  return 140*(1-dot)+(dot < -.85?250:0);
}
const edgeCost=e=>e.length*(["path","footway","pedestrian","track"].includes(e.kind)?1:1.02);
// Collapse ordinary degree-two chains for search only. Every original vertex,
// edge cost and internal bend survives reconstruction, rendering and export.
function searchGraph(g, endpoints) {
  const stops=new Set(endpoints);
  for(const n of g.values()) {
    const neighbors=new Set(n.edges.map(e=>e.to));
    if(n.signal || neighbors.size!==2 || [...neighbors].some(id=>!g.get(id).edges.some(e=>e.to===n.id))) stops.add(n.id);
  }
  const result=new Map(g);
  for(const id of stops) {
    const n=g.get(id),edges=[];
    for(const initial of n.edges) {
      let previous=n,current=g.get(initial.to),length=initial.length,cost=edgeCost(initial);
      const path=[current.id],keys=[initial.key],seen=new Set([id]);
      while(!stops.has(current.id) && !seen.has(current.id)) {
        seen.add(current.id);
        const e=current.edges.find(e=>e.to!==previous.id);
        if(!e) break;
        const next=g.get(e.to);
        cost+=edgeCost(e)+bendCost(previous,current,next);
        length+=e.length;keys.push(e.key);path.push(next.id);
        previous=current;current=next;
      }
      edges.push({...initial,to:current.id,length,cost,path,keys,first:path[0],lastFrom:previous.id});
    }
    result.set(id,{...n,edges});
  }
  return result;
}
// Search state includes the incoming edge: the cheapest arrival at a junction
// is not always the cheapest continuation when turning has a cost.
export function shortest(g, start, end, avoid = false, used = new Set(), incoming = null, maxDistance = Infinity) {
  if (start === end) return [start];
  const destination = g.get(end), h = new Heap();
  const initial = {id:start, from:incoming, cost:0, length:0, prev:null};
  const key = (from, to) => `${from ?? "origin"}>${to}`;
  const costs = new Map([[key(incoming,start),0]]);
  h.push([meters(g.get(start),destination),initial]);
  while (h.a.length) {
    const [, state] = h.pop(), {id,from,cost} = state;
    if (cost !== costs.get(key(from,id))) continue;
    if (id === end) {
      const chunks=[];
      for(let step=state;step;step=step.prev) chunks.push(step.path ?? [step.id]);
      return chunks.reverse().flat();
    }
    const n=g.get(id), previous=from == null ? null : g.get(from);
    for (const e of n.edges) {
      const next=g.get(e.to);
      if (avoid && next.signal) continue;
      // Already-run segments should not be used just to fill the distance.
      if ((e.keys ?? [e.key]).some(k=>used.has(k))) continue;
      const turnCost=bendCost(previous,n,g.get(e.first ?? e.to));
      const length=state.length+e.length;
      if(length+meters(next,destination)>maxDistance) continue;
      const c=cost+(e.cost ?? edgeCost(e))+turnCost+(next.signal?65:0);
      const fromId=e.lastFrom ?? id;
      const k=key(fromId,e.to);
      if(c < (costs.get(k) ?? Infinity)) {
        costs.set(k,c);
        h.push([c+meters(next,destination),{id:e.to,from:fromId,cost:c,length,prev:state,path:e.path ?? [e.to]}]);
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
    // This is the same vertex geometry drawn on the map and exported to GPX.
    distance += meters(p, n);
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
  const search=searchGraph(g,[s.node.id,t.node.id]);
  const candidates = [],
    signatures = new Set(),
    waypointCache = new Map(),
    triedStops = new Map();
  const junctions=new Map([...g].filter(([,n])=>new Set(n.edges.map(e=>e.to)).size>=3));
  function add(stops) {
    const stopKey=stops.join(",");
    if(triedStops.has(stopKey)) return triedStops.get(stopKey);
    triedStops.set(stopKey,null);
    let ids = [s.node.id], traversed=0,
      used = new Set();
    for (const stop of stops) {
      const part = shortest(search, ids.at(-1), stop, avoid, used, ids.at(-2),target*1.5-traversed);
      if (!part) return;
      for (let i = 1; i < part.length; i++) {
        used.add([part[i - 1], part[i]].sort().join(":"));
        traversed+=meters(g.get(part[i-1]),g.get(part[i]));
      }
      ids.push(...part.slice(1));
    }
    if (ids.length < 3) return;
    const coordinates = ids.map((id) => [g.get(id).lat, g.get(id).lon]);
    const f = { ...features(g, ids, target), ...shapeFeatures(coordinates) };
    triedStops.set(stopKey,f.distance);
    // Do not recommend a short course for a distance goal. Never inflate the
    // measured geometry to compensate for a particular watch recording.
    if (f.distance < target || f.distance > target * 1.05) return f.distance;
    if (f.uTurns > 0 || f.repeatFraction > .01 || f.nearRetraceFraction > .03 || f.maxNearRetraceMeters > 60) return f.distance;
    if (f.turns > Math.max(8,3*target/1000)) return f.distance;
    const signature = [...used].sort().join(",");
    if (signatures.has(signature)) return f.distance;
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
    return f.distance;
  }
  if (end) add([t.node.id]);
  const center=end
    ? {lat:(s.node.lat+t.node.lat)/2,lon:(s.node.lon+t.node.lon)/2}
    : s.node;
  const waypoint=(x,y)=>{
    const p={lat:center.lat+y/111320,lon:center.lon+x/(111320*Math.cos(center.lat*Math.PI/180))};
    const key=`${x.toFixed(1)},${y.toFixed(1)}`;
    if(!waypointCache.has(key)) waypointCache.set(key,nearest(junctions.size?junctions:g,p,avoid).node?.id);
    return waypointCache.get(key);
  };
  // Rectangles seek long straight corridors; triangles add options around parks
  // and irregular streets. More candidates do not relax the quality gate.
  for (let k=0;k<16;k++) {
    const angle=k*Math.PI/8;
    for(const aspect of (end?[0]:[0,.35,.6,1,1.6,2.8])) {
      let scale=1;
      for(let attempt=0;attempt<4;attempt++) {
        const polar=(a,r)=>waypoint(Math.sin(a)*r,Math.cos(a)*r);
        let stops;
        if(aspect===0) {
          const radius=target/5.8*scale;
          stops=end?[polar(angle,radius),t.node.id]:[polar(angle,radius),polar(angle+Math.PI*.65,radius),s.node.id];
        } else {
          const width=target/(2*(1+aspect))*scale,height=width*aspect;
          const x=Math.sin(angle)*width,y=Math.cos(angle)*width;
          const dx=Math.cos(angle)*height,dy=-Math.sin(angle)*height;
          stops=[waypoint(x,y),waypoint(x+dx,y+dy),waypoint(dx,dy),s.node.id];
        }
        const length=stops.every(id=>id!=null)?add(stops):null;
        if(!length) { scale*=.85; continue; }
        // A small deterministic perturbation explores nearby corridors after
        // fitting the perimeter, rather than padding a route with a spur.
        scale*=Math.max(.65,Math.min(1.4,target*1.025/length));
        if(attempt>0) scale*=attempt%2?1.03:.97;
      }
    }
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
    if (diverse.length === 7) break;
  }
  return diverse;
}
