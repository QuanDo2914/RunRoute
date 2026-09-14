import { graphFrom, generate } from '/engine.mjs';
import {snapEndpoint} from '/snap.mjs';
let graphPromise;
self.onmessage=async({data})=>{try{
 if(!graphPromise)graphPromise=fetch(data.url).then(r=>{if(!r.ok)throw Error('Regional map data is unavailable. Please try again later.');return r.json();}).then(graphFrom).catch(e=>{graphPromise=null;throw e;});
 const graph=await graphPromise;
 if(data.kind==='snap'){
  const network=new Map(graph),s=snapEndpoint(network,data.request.start,'snap:start'),t=data.request.end?snapEndpoint(network,data.request.end,'snap:end'):s;
  self.postMessage({kind:'snap',id:data.id,start:{lat:s.node.lat,lon:s.node.lon,description:s.description},end:{lat:t.node.lat,lon:t.node.lon,description:t.description}});return;
 }
 self.postMessage({id:data.id,routes:generate(graph,data.request)});
 }catch(e){self.postMessage({kind:data.kind,id:data.id,error:e.message||'Route generation failed.'});}};
