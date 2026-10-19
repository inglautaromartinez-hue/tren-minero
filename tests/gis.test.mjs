import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}`,import.meta.url)));
const routes=read('routes.geojson').features;
const manifest=read('manifest.json');

test('las propuestas conservan 11 tramos, huecos explícitos y faltantes como null',()=>{
  assert.equal(routes.length,11);
  assert.deepEqual(Object.values(manifest.routes).map(r=>r.segment_count),[4,2,5]);
  assert.equal(manifest.routes.T3.topology_status,'connected_within_tolerance');
  for(const rid of ['T1','T2'])assert.equal(manifest.routes[rid].topology_status,'disconnected');
  assert.ok(manifest.routes.T1.gaps[1].distance_m>25000);
  assert.ok(manifest.routes.T2.gaps[0].distance_m>170);
  for(const r of Object.values(manifest.routes)){
    assert.equal(r.complete_itinerary,false);
    assert.equal(r.parcel_count,null);
    assert.equal(r.affected_parcel_ha,null);
    assert.equal(r.elevation_status,'not_processed');
  }
});

test('longitudes y corredor conservan el orden de magnitud documentado',()=>{
  for(const [rid,length] of [['T1',656.495],['T2',327.300],['T3',489.417]]){
    const r=manifest.routes[rid];
    assert.ok(Math.abs(r.length_km-length)<0.002);
    assert.ok(r.corridor_ha>r.length_km*19.8&&r.corridor_ha<r.length_km*20.1);
  }
  assert.match(manifest.area_method,/WGS84 ellipsoidal/);
  assert.ok(manifest.buffer_projection_scale_sampled.max<1.0005);
  const approximate=routes.find(f=>f.properties.segment_id==='T2-01').properties;
  assert.equal(approximate.source_vertex_count,70);
  assert.ok(approximate.source_max_edge_km>45);
});

// Python geospatial dependencies are exercised in CI as well as locally.
function python(code){const p=spawnSync('python',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(p.status,0,p.stderr||p.stdout);}
test('el área elipsoidal resta agujeros y suma multipolígonos aunque se inviertan los anillos',()=>{
  python(`
from scripts.prepare_routes import geodesic_area_m2, GEOD
from shapely.geometry import Polygon, MultiPolygon
outer=[(-68,-35),(-67.98,-35),(-67.98,-34.98),(-68,-34.98)]
hole=[(-67.995,-34.995),(-67.985,-34.995),(-67.985,-34.985),(-67.995,-34.985)]
reference=abs(GEOD.polygon_area_perimeter(*zip(*outer))[0])-abs(GEOD.polygon_area_perimeter(*zip(*hole))[0])
for shell in [outer,outer[::-1]]:
 for ring in [hole,hole[::-1]]:
  actual=geodesic_area_m2(Polygon(shell,[ring]))
  assert abs(actual-reference)<0.001,(actual,reference)
other=Polygon([(-69,-36),(-68.99,-36),(-68.99,-35.99),(-69,-35.99)])
assert abs(geodesic_area_m2(MultiPolygon([Polygon(outer,[hole]),other]))-(reference+geodesic_area_m2(other)))<0.001
`);
});

test('las hectáreas publicadas son la unión del corredor íntegro, estables con muestreo de bordes a 100 m',()=>{
  python(`
from scripts.prepare_routes import geodesic_area_m2
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from pyproj import Transformer
from pathlib import Path
import json
m=json.loads(Path('public/data/manifest.json').read_text()); features=json.loads(Path('public/data/routes.geojson').read_text())['features']
analysis=json.loads(Path('public/data/corridors-analysis.geojson').read_text())['features']
forward=Transformer.from_crs(4326,m['analysis_crs'],always_xy=True).transform
backward=Transformer.from_crs(m['analysis_crs'],4326,always_xy=True).transform
for rid in ['T1','T2','T3']:
 corridors=[transform(forward,shape(f['geometry'])).buffer(100,quad_segs=16) for f in features if f['properties']['route_id']==rid]
 full=unary_union(corridors)
 measured=geodesic_area_m2(transform(backward,full.segmentize(100)))/10000
 assert abs(measured-m['routes'][rid]['corridor_ha'])<0.001,(rid,measured)
 assert full.area<sum(c.area for c in corridors) # shared joins are not double-counted
 exported=next(f for f in analysis if f['properties']['route_id']==rid)
 assert exported['properties']['tolerance']==0
 assert exported['properties']['area_ha']==m['routes'][rid]['corridor_ha']
 analytic_geometry=shape(exported['geometry'])
 assert analytic_geometry.is_valid
 assert abs(geodesic_area_m2(analytic_geometry)/10000-measured)<0.000001
 projected=transform(forward,analytic_geometry)
 assert full.symmetric_difference(projected).area<0.01
 polygons=projected.geoms if projected.geom_type=='MultiPolygon' else [projected]
 for polygon in polygons:
  for ring in [polygon.exterior,*polygon.interiors]:
   assert all(((b[0]-a[0])**2+(b[1]-a[1])**2)**0.5<=100.00001 for a,b in zip(ring.coords,list(ring.coords)[1:]))
`);
});

const sourceCandidates=[new URL('../data/source/TRAZAS.kml',import.meta.url),new URL('../../upload/TRAZAS.kml',import.meta.url)];
const source=sourceCandidates.find(p=>existsSync(p));
test('el azul usa el empalme norte de Div 50, pasa por Iselín y excluye la cola a San Rafael',{skip:source?false:'KML original ausente; validación de fuente no ejecutada'},()=>{
  python(`
import xml.etree.ElementTree as ET, json, hashlib
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform
from pyproj import Transformer
from pathlib import Path
source=Path(${JSON.stringify(source?.pathname||'')})
ns={'k':'http://www.opengis.net/kml/2.2'}
root=ET.parse(source).getroot(); lines={};points={}
for p in root.findall('.//k:Placemark',ns):
 name=p.findtext('k:name',namespaces=ns)
 for el in p.findall('.//k:LineString/k:coordinates',ns):lines.setdefault(name,LineString([tuple(map(float,s.split(',')))[:2] for s in el.text.split()]))
 for el in p.findall('.//k:Point/k:coordinates',ns):points.setdefault(name,Point(tuple(map(float,el.text.strip().split(',')))[:2]))
manifest=json.loads(Path('public/data/manifest.json').read_text()); assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['source_sha256']
project=Transformer.from_crs(4326,manifest['analysis_crs'],always_xy=True).transform
data=json.loads(Path('public/data/routes.geojson').read_text())['features'];out={f['properties']['segment_id']:transform(project,shape(f['geometry'])) for f in data}
div50=transform(project,lines['Div 50: Monte Comán - Colonia General Alvear Norte'])
assert 11000<out['T3-02'].length<12000
assert out['T3-02'].difference(div50.buffer(0.01)).length<0.01
div47=transform(project,lines['Div 47: Monte Comán - Pedro Vargas - San Rafael'])
assert out['T3-03'].distance(transform(project,points['Rodolfo Iselín KM 14.5']))<150
assert out['T3-03'].distance(Point(div47.coords[-1]))>5000
assert out['T3-03'].length<div47.length-10000
for sid in ['T3-01','T3-02','T3-03','T3-04']:
 f=next(f for f in data if f['properties']['segment_id']==sid)
 full=transform(project,lines[f['properties']['source_name']])
 assert out[sid].difference(full.buffer(0.01)).length<0.01
`);
});
