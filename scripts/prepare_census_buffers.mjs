// Reproduce the private analytical operands from the versioned route geometry.
import fs from 'node:fs/promises';
import {buildRouteChains} from '../src/selection.mjs';
import {createRouteStudy} from '../src/route-study.mjs';
import {buildStudyBuffer} from '../src/study-buffer.mjs';
const root=new URL('../',import.meta.url);
const chains=buildRouteChains(JSON.parse(await fs.readFile(new URL('public/data/routes.geojson',root),'utf8')));
const features=[];
for(const id of ['T1','T2','T3'])for(const radius of [100,125])features.push(buildStudyBuffer(createRouteStudy(chains,id),radius));
await fs.mkdir(new URL('data/private/',root),{recursive:true});
await fs.writeFile(new URL('data/private/census-buffers.geojson',root),JSON.stringify({type:'FeatureCollection',features}));
console.log('Preparados buffers privados WGS84 de estudio (100 m) y apoyo (125 m) para tres propuestas.');
