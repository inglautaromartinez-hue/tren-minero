// El sitio de presentación sólo distribuye los campos que usa el mapa.
// Esto reduce exposición accidental, no convierte el repositorio público en privado.
import fs from 'node:fs';
const root=new URL('../dist/data/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
const write=(name,value)=>fs.writeFileSync(new URL(name,root),JSON.stringify(value));
const original=read('manifest.json');
write('manifest.json',{schema_version:1,buffer_m:100,routes:Object.fromEntries(Object.entries(original.routes).map(([id,r])=>[id,{id,name:r.name,color:r.color,length_km:r.length_km,corridor_ha:r.corridor_ha}]))});
const routes=read('routes.geojson');
for(const f of routes.features){const p=f.properties;f.properties={route_id:p.route_id,segment_id:p.segment_id,name:p.name,color:p.color,length_km:p.length_km,quality:p.quality};}
write('routes.geojson',routes);
const corridors=read('corridors.geojson');for(const f of corridors.features)f.properties={route_id:f.properties.route_id,color:f.properties.color};write('corridors.geojson',corridors);
fs.rmSync(new URL('corridors-analysis.geojson',root),{force:true});
console.log('Presentación pública preparada: sin configuración interna, hashes ni corredor analítico descargable.');
