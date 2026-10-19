import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../api/dem.js';

const tile='Copernicus_DSM_COG_10_S35_00_W068_00_DEM';
const request=(range='bytes=0-3',key=tile)=>new Request(`https://example.test/api/dem?tile=${encodeURIComponent(key)}`,{headers:range?{Range:range}:{}});
async function withFetch(mock,run){const original=globalThis.fetch;globalThis.fetch=mock;try{return await run();}finally{globalThis.fetch=original;}}

test('DEM API: rechaza tile arbitrario, rango ausente/abierto/múltiple e índices inseguros',async()=>{
  let calls=0;await withFetch(async()=>{calls++;throw Error('No debe consultar upstream');},async()=>{
    for(const req of [request('bytes=0-3','https://otro.example/a.tif'),request(null),request('bytes=0-'),request('bytes=0-1,4-5'),request('bytes=3-2'),request('bytes=9007199254740992-9007199254740993')])assert.equal((await GET(req)).status,400);
  });assert.equal(calls,0);
});

test('DEM API: rango inclusivo permite exactamente 2 MiB y rechaza un byte extra',async()=>{
  const cap=2*1024*1024;let calls=0;
  await withFetch(async()=>{calls++;return new Response(new Uint8Array(cap),{status:206,headers:{'Content-Range':`bytes 0-${cap-1}/${cap}`}});},async()=>{
    assert.equal((await GET(request(`bytes=0-${cap-1}`))).status,206);
    assert.equal((await GET(request(`bytes=0-${cap}`))).status,400);
  });assert.equal(calls,1);
});

test('DEM API: sólo solicita S3 fijo sin redirects y devuelve bloque parcial coherente',async()=>{
  await withFetch(async(url,options)=>{
    assert.equal(url,`https://copernicus-dem-30m.s3.amazonaws.com/${tile}/${tile}.tif`);
    assert.equal(options.redirect,'error');assert.equal(options.headers.Range,'bytes=0-3');
    return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'Content-Range':'bytes 0-3/100'}});
  },async()=>{
    const response=await GET(request());assert.equal(response.status,206);
    assert.equal(response.headers.get('Content-Range'),'bytes 0-3/100');assert.equal(response.headers.get('Vary'),'Range');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4]);
  });
});

test('DEM API: upstream completo, offset equivocado, Content-Range ausente o bytes truncados no son éxito',async()=>{
  for(const upstream of [
    new Response(new Uint8Array(4),{status:200}),
    new Response(new Uint8Array(4),{status:206}),
    new Response(new Uint8Array(4),{status:206,headers:{'Content-Range':'bytes 4-7/100'}}),
    new Response(new Uint8Array(2),{status:206,headers:{'Content-Range':'bytes 0-3/100'}}),
  ])await withFetch(async()=>upstream,async()=>assert.equal((await GET(request())).status,502));
});
