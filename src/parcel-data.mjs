const fail=message=>{throw new Error(message);};
function position(p){return Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;}
function ring(r){return Array.isArray(r)&&r.length>=4&&r.every(position)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]&&new Set(r.slice(0,-1).map(p=>`${p[0]},${p[1]}`)).size>=3;}
function polygon(p){return Array.isArray(p)&&p.length>=1&&p.every(ring);}
export function validateParcelData(data){
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))fail('Se esperaba un GeoJSON FeatureCollection del cruce parcelario.');
 if(data.crs&&!/4326|CRS84/i.test(JSON.stringify(data.crs)))fail('El cruce debe exportarse en EPSG:4326 (longitud, latitud).');
 const seen=new Set();
 for(const f of data.features){const p=f.properties,g=f.geometry,key=`${p?.route_id}:${p?.nc?.trim?.()}`;
  if(f.type!=='Feature'||!p||typeof p.nc!=='string'||!p.nc.trim()||p.nc!==p.nc.trim()||!['T1','T2','T3'].includes(p.route_id)||!Number.isFinite(p.affected_m2)||p.affected_m2<=0||!Number.isFinite(p.affected_pct)||p.affected_pct<0||p.affected_pct>100.01||p.owner!=null&&typeof p.owner!=='string')fail('Campos requeridos: nc (texto), route_id, affected_m2, affected_pct y titular como texto opcional.');
  if(!g||!(g.type==='Polygon'&&polygon(g.coordinates)||g.type==='MultiPolygon'&&Array.isArray(g.coordinates)&&g.coordinates.length>0&&g.coordinates.every(polygon)))fail('Geometría poligonal inválida: usar anillos cerrados, no vacíos y coordenadas WGS84 (longitud, latitud).');
  if(seen.has(key))fail('Hay NC repetidas para una misma traza. Unificá los componentes en el cruce GIS.');seen.add(key);
 }
 return data;
}
export function routeSummary(data,id){const fs=data?.features.filter(f=>f.properties.route_id===id)||[],info=data?.metadata?.routes?.[id];const coverage=info?.evaluated===true&&info.coverage_status==='complete'?'complete':fs.length?'partial':info?.evaluated===true?'unknown':'not_evaluated';const observed=fs.length>0||coverage==='complete'||info?.analysis_complete===true;return{count:observed?new Set(fs.map(f=>f.properties.nc)).size:null,areaHa:observed&&info?.union_status!=='failed'?(Number.isFinite(info?.covered_union_m2)?info.covered_union_m2:fs.reduce((a,f)=>a+f.properties.affected_m2,0))/10000:null,coverage,observed};}
