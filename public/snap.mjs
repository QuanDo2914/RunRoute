// Snap to a segment, preserving its geometry and legal travel directions.
const aliases={north:'n',south:'s',east:'e',west:'w',street:'st',avenue:'ave',road:'rd',drive:'dr',lane:'ln',court:'ct',boulevard:'blvd'};
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(x=>aliases[x]||x).join(' ');
export function addressStreet(p){return p.street||p.name?.match(/^\d+[a-zA-Z-]*\s+([^,]+)/)?.[1]||null;}
function project(p,a,b){const scale=111320*Math.cos(p.lat*Math.PI/180),ax=(a.lon-p.lon)*scale,ay=(a.lat-p.lat)*111320,dx=(b.lon-a.lon)*scale,dy=(b.lat-a.lat)*111320;const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));return {lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,t,distance:Math.hypot(ax+t*dx,ay+t*dy),dx,dy};}
export function snapEndpoint(g,p,id){
 const street=addressStreet(p),segments=[],seen=new Set();
 for(const a of g.values())for(const edge of a.edges){if(seen.has(edge.key))continue;seen.add(edge.key);const b=g.get(edge.to),projection=project(p,a,b);if(projection.distance<=200)segments.push({a,b,edge,...projection});}
 let candidates=segments;
 if(street){
  const roads=segments.filter(s=>normalize(s.edge.name||'')===normalize(street));
  roads.sort((a,b)=>a.distance-b.distance);const road=roads[0];
  if(!road)throw Error(`Could not find a running segment on ${street} near this address. Pick the street-facing start on the map.`);
  const sidewalks=segments.filter(s=>{
   if(s.edge.footway!=='sidewalk')return false;
   const dot=(s.dx*road.dx+s.dy*road.dy)/(Math.hypot(s.dx,s.dy)*Math.hypot(road.dx,road.dy)||1);
   const onRoad=project(s,road.a,road.b);
   // Same frontage, parallel to the street, on the address side of the road.
   const cross=x=>road.dx*(x.lat-road.a.lat)*111320-road.dy*(x.lon-road.a.lon)*111320*Math.cos(p.lat*Math.PI/180);
   return Math.abs(dot)>.9&&onRoad.distance<30&&Math.hypot((s.lat-road.lat)*111320,(s.lon-road.lon)*85000)<50&&cross(p)*cross(s)>=0;
  });
  candidates=sidewalks.length?sidewalks:roads;
 }
 candidates.sort((a,b)=>a.distance-b.distance);const selected=candidates[0];
 if(!selected)throw Error('Choose a location within 200 m of a mapped running road or path.');
 const {a,b,edge,t,lat,lon,distance}=selected;
 const description=edge.footway==='sidewalk'?`Sidewalk${street?' along '+street:''}`:edge.name||'Mapped path';
 if(t<.00001)return {node:a,distance,description,street};
 if(t>.99999)return {node:b,distance,description,street};
 const elevation=a.elevation!=null&&b.elevation!=null?a.elevation+(b.elevation-a.elevation)*t:null;
 const node={id,lat,lon,elevation,signal:false,edges:[]};
 const leftKey=[a.id,id].sort().join(":"),rightKey=[id,b.id].sort().join(":");
 const forward=a.edges.filter(e=>e.to===b.id&&e.key===edge.key),reverse=b.edges.filter(e=>e.to===a.id&&e.key===edge.key);
 // Copy-on-write: never alter the cached region graph.
 const left={...a,edges:a.edges.filter(e=>!(e.to===b.id&&e.key===edge.key))},right={...b,edges:b.edges.filter(e=>!(e.to===a.id&&e.key===edge.key))};
 for(const e of forward){left.edges.push({...e,to:id,key:leftKey,length:e.length*t});node.edges.push({...e,to:b.id,key:rightKey,length:e.length*(1-t)});}
 for(const e of reverse){right.edges.push({...e,to:id,key:rightKey,length:e.length*(1-t)});node.edges.push({...e,to:a.id,key:leftKey,length:e.length*t});}
 g.set(left.id,left);g.set(right.id,right);g.set(id,node);
 return {node,distance,description,street};
}
