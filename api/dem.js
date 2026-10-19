// Pasarela acotada a bloques de los COG públicos. No admite URLs arbitrarias.
export async function GET(request){
 const u=new URL(request.url),tile=u.searchParams.get('tile');
 if(!/^Copernicus_DSM_COG_10_S(?:3[3-8])_00_W0(?:6[4-9]|70)_00_DEM$/.test(tile||''))return Response.json({error:'Tesela fuera del ámbito del proyecto.'},{status:400});
 const range=request.headers.get('range'),match=/^bytes=(\d+)-(\d+)$/.exec(range||'');
 if(!match||!Number.isSafeInteger(Number(match[1]))||!Number.isSafeInteger(Number(match[2]))||Number(match[2])<Number(match[1])||Number(match[2])-Number(match[1])+1>2*1024*1024)return Response.json({error:'Se requiere un rango de hasta 2 MiB.'},{status:400});
 try{
  const response=await fetch(`https://copernicus-dem-30m.s3.amazonaws.com/${tile}/${tile}.tif`,{headers:{Range:range},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(response.status!==206)return Response.json({error:'Copernicus no devolvió el bloque solicitado.'},{status:502});
  const cr=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!cr||!cr.slice(1).every(v=>Number.isSafeInteger(Number(v)))||Number(cr[1])!==Number(match[1])||Number(cr[2])>Number(match[2])||Number(cr[2])<Number(cr[1])||Number(cr[3])<=Number(cr[2]))return Response.json({error:'Rango de respuesta incoherente.'},{status:502});
  const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024||bytes.byteLength!==Number(cr[2])-Number(cr[1])+1)return Response.json({error:'Bloque excedido.'},{status:502});
  return new Response(bytes,{status:206,headers:{'Content-Type':'image/tiff','Content-Range':response.headers.get('content-range')||'','Accept-Ranges':'bytes','Cache-Control':'public, max-age=86400','Vary':'Range','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('dem_block_unavailable',error.name);return Response.json({error:'No fue posible consultar Copernicus.'},{status:502});}
}
