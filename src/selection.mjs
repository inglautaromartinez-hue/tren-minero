import geodesic from 'geographiclib-geodesic';

const WGS84 = geodesic.Geodesic.WGS84;
const rad = value => value * Math.PI / 180;
const valid = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const copy = p => [p[0], p[1]];
const inverse = (a,b) => WGS84.Inverse(a[1],a[0],b[1],b[0]);
const metres = (a,b) => inverse(a,b).s12;
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
function along(a,azimuth,distance) {
  if (distance === 0) return copy(a);
  const p = WGS84.Direct(a[1],a[0],azimuth,distance);
  return [p.lon2,p.lat2];
}
function clean(coords) {
  if (!Array.isArray(coords) || coords.some(p => !valid(p))) throw new TypeError('Se requieren coordenadas WGS84 [longitud, latitud] finitas.');
  return coords.reduce((out,p) => {
    if (!out.length || metres(out.at(-1),p) > 1e-7) out.push(copy(p));
    return out;
  },[]);
}
function edges(coords) {
  let distance=0;
  return coords.slice(1).map((b,index) => {
    const a=coords[index], edge=inverse(a,b), from=distance;
    distance+=edge.s12;
    return {a,b,index,from,length:edge.s12,azimuth:edge.azi1};
  });
}
function length(coords) { return edges(coords).reduce((sum,e) => sum+e.length,0); }

/** Ordered source geometries; never joins across a gap larger than maxGapM.
 * Submetre joins retain both source endpoints (and their tiny gap), rather
 * than moving an endpoint or claiming an operational railway connection.
 */
export function buildRouteChains(features,{maxGapM=1}={}) {
  if (!Number.isFinite(maxGapM) || maxGapM<0) throw new RangeError('La tolerancia de unión debe ser finita y no negativa.');
  const list=Array.isArray(features)?features:features?.features;
  if (!Array.isArray(list)) throw new TypeError('Se requiere una lista de features o FeatureCollection.');
  const grouped=new Map();
  list.forEach((feature,index) => {
    if (feature.geometry?.type!=='LineString') throw new TypeError('La selección requiere fuentes LineString.');
    const coords=clean(feature.geometry.coordinates);
    if (coords.length<2) return;
    const route=feature.properties?.route_id;
    if (route===undefined || route===null) throw new TypeError('Cada tramo debe identificar route_id.');
    if (!grouped.has(route)) grouped.set(route,[]);
    grouped.get(route).push({coords,properties:feature.properties||{},index});
  });
  const result=[];
  for (const [route,sources] of grouped) {
    let chain=null,number=0;
    for (const source of sources) {
      const gap=chain?metres(chain.geometry.coordinates.at(-1),source.coords[0]):Infinity;
      if (gap>maxGapM) {
        chain={type:'Feature',properties:{chain_id:`${route}:chain:${++number}`,route_id:route,source_segment_ids:[],title:'',length_m:0,join_tolerance_m:maxGapM,join_gaps_m:[]},geometry:{type:'LineString',coordinates:[]}};
        result.push(chain);
      } else chain.properties.join_gaps_m.push(gap);
      const id=source.properties.segment_id??`source:${source.index}`;
      chain.properties.source_segment_ids.push(id);
      const title=source.properties.title||source.properties.name||String(id);
      chain.properties.title=chain.properties.title?`${chain.properties.title} / ${title}`:title;
      for (const p of source.coords) {
        if (!chain.geometry.coordinates.length || metres(chain.geometry.coordinates.at(-1),p)>1e-7) chain.geometry.coordinates.push(copy(p));
      }
      chain.properties.length_m=length(chain.geometry.coordinates);
    }
  }
  return result;
}

/** Nearest point and geodesic chainage. distance_m aliases chainage_m;
 * offset_m is the distance from the clicked point to the selected line.
 * Geodesic edges are subdivided internally to <=5 km for the local search;
 * source geometry and original segment_index are retained.
 */
export function nearestOnLine(coords,point) {
  if (!valid(point)) throw new TypeError('El punto debe ser [longitud, latitud] WGS84.');
  if (!Array.isArray(coords) || !coords.length) return null;
  if (coords.some(p=>!valid(p))) throw new TypeError('La línea debe contener coordenadas WGS84 finitas.');
  const all=edges(coords);
  let best=null;
  for (const e of all) {
    if (e.length<=1e-7) continue;
    const divisions=Math.max(1,Math.ceil(e.length/5000));
    for (let i=0;i<divisions;i++) {
      const lo=e.length*i/divisions,hi=e.length*(i+1)/divisions;
      const a=along(e.a,e.azimuth,lo),b=along(e.a,e.azimuth,hi);
      // Azimuthal local coordinates centred on the clicked point: radial
      // distances are exact WGS84 distances; short-cell projection seeds t.
      const ap=inverse(point,a),bp=inverse(point,b);
      const ax=ap.s12*Math.sin(rad(ap.azi1)),ay=ap.s12*Math.cos(rad(ap.azi1));
      const bx=bp.s12*Math.sin(rad(bp.azi1)),by=bp.s12*Math.cos(rad(bp.azi1));
      const dx=bx-ax,dy=by-ay;
      const t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1);
      const position=lo+(hi-lo)*t,coord=along(e.a,e.azimuth,position),offset=metres(point,coord);
      if (!best || offset<best.offset) best={e,lo,hi,position,coord,offset};
    }
  }
  if (!best) return {coord:copy(coords[0]),distance_m:0,chainage_m:0,segment_index:0,offset_m:metres(point,coords[0])};
  // Refine the best short cell with ellipsoidal distances, including exact
  // endpoints. A cell of 5 km converges to <1 mm of chainage in 34 steps.
  const ratio=(Math.sqrt(5)-1)/2;
  let lo=best.lo,hi=best.hi;
  const evaluate=p=>({position:p,coord:along(best.e.a,best.e.azimuth,p)});
  const value=p=>metres(point,along(best.e.a,best.e.azimuth,p));
  let c=hi-ratio*(hi-lo),d=lo+ratio*(hi-lo),fc=value(c),fd=value(d);
  for(let i=0;i<34;i++) {
    if(fc<fd){hi=d;d=c;fd=fc;c=hi-ratio*(hi-lo);fc=value(c);}
    else {lo=c;c=d;fc=fd;d=lo+ratio*(hi-lo);fd=value(d);}
  }
  const candidates=[best.position,best.lo,best.hi,(lo+hi)/2].map(evaluate);
  for(const candidate of candidates) {
    const offset=metres(point,candidate.coord);
    if(offset<best.offset) Object.assign(best,candidate,{offset});
  }
  const chainage=best.e.from+best.position;
  return {coord:copy(best.coord),distance_m:chainage,chainage_m:chainage,segment_index:best.e.index,offset_m:best.offset};
}

/** Exact geodesic interpolation on the same vertex chain as nearestOnLine.
 * Bounds clamp to [0,total]; reversed bounds return reversed coordinates.
 * A zero-length range yields one point. Caller rejects ranges below 10 m.
 */
export function sliceLineBetween(coords,a_m,b_m) {
  if (!Number.isFinite(a_m)||!Number.isFinite(b_m)) throw new TypeError('Las progresivas deben ser finitas.');
  const line=clean(coords);
  if (!line.length) return [];
  const all=edges(line),total=all.reduce((sum,e)=>sum+e.length,0);
  const a=clamp(a_m,0,total),b=clamp(b_m,0,total),lo=Math.min(a,b),hi=Math.max(a,b);
  const at=distance=>{
    if(distance===0)return copy(line[0]);
    if(distance===total)return copy(line.at(-1));
    const e=all.find(edge=>edge.from+edge.length>=distance);
    return along(e.a,e.azimuth,distance-e.from);
  };
  const selected=[at(lo)];
  for (const e of all) if(e.from+e.length>lo && e.from+e.length<hi) selected.push(copy(e.b));
  selected.push(at(hi));
  const result=clean(selected);
  return a>b?result.reverse():result;
}
