import geodesic from 'geographiclib-geodesic';
const geod=geodesic.Geodesic.WGS84;
function position(p){if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Coordenadas WGS84 inválidas');}
function line(coords){if(!Array.isArray(coords))throw Error('Eje inválido');coords.forEach(position);}
export function distance(a,b){position(a);position(b);return geod.Inverse(a[1],a[0],b[1],b[0]).s12;}
export function stations(coords,step=1000){
 line(coords);if(!coords.length)return[];
 if(!Number.isFinite(step)||step<=0)throw Error('Paso de muestreo inválido');
 const result=[{xy:coords[0],distance:0}],edges=[];let total=0;
 for(let i=1;i<coords.length;i++){const inv=geod.Inverse(coords[i-1][1],coords[i-1][0],coords[i][1],coords[i][0]);if(inv.s12>0){edges.push({a:coords[i-1],azi:inv.azi1,from:total,len:inv.s12});total+=inv.s12;}}
 if(total/step>100000)throw Error('Demasiadas muestras para el paso elegido');
 let e=0;for(let n=1;n*step<total;n++){const s=n*step;while(e<edges.length-1&&edges[e].from+edges[e].len<s)e++;const v=edges[e],p=geod.Direct(v.a[1],v.a[0],v.azi,s-v.from);result.push({xy:[p.lon2,p.lat2],distance:s});}
 if(total>0)result.push({xy:coords.at(-1),distance:total});return result;
}
export function slope(a,b){return Number.isFinite(a?.z)&&Number.isFinite(b?.z)&&b.distance>a.distance?(b.z-a.z)/(b.distance-a.distance)*1000:null;}
export function transverse(coords,d,width=100,step=25){
 line(coords);if(!Number.isFinite(d)||!Number.isFinite(width)||width<0||!Number.isFinite(step)||step<=0||2*width/step>10000)throw Error('Parámetros de sección inválidos');
 if(coords.length<2)throw Error('Se requiere un eje para la sección transversal');
 const total=coords.slice(1).reduce((s,c,i)=>s+distance(coords[i],c),0);d=Math.max(0,Math.min(total,d));
 let from=0,center,azi;
 for(let i=1;i<coords.length;i++){const inv=geod.Inverse(coords[i-1][1],coords[i-1][0],coords[i][1],coords[i][0]);if(inv.s12<=0)continue;if(from+inv.s12>=d||i===coords.length-1){const p=geod.Direct(coords[i-1][1],coords[i-1][0],inv.azi1,Math.max(0,d-from));center=[p.lon2,p.lat2];azi=p.azi2;break;}from+=inv.s12;}
 if(!center)throw Error('Eje sin longitud útil');
 const offsets=new Set([-width,0,width]);for(let i=1;i*step<2*width;i++)offsets.add(-width+i*step);
 return [...offsets].sort((a,b)=>a-b).map(s=>{const p=geod.Direct(center[1],center[0],azi+(s<0?-90:90),Math.abs(s));return{xy:[p.lon2,p.lat2],distance:s};});
}
export function safeCSV(value){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
