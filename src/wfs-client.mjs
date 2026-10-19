// Public, read-only, bounded queries. No cadastral response is uploaded or
// persisted by this module; completeness refers only to the requested bbox.
export const WFS_ENDPOINT='https://geonode-cam.marketsis.com.ar/geoserver/wfs';
export const ALLOWED_WFS_LAYERS=Object.freeze(['GENERAL_ALVEAR','LA_PAZ','MALARGUE','SANTA_ROSA','SAN_RAFAEL'].map(name=>`geonode:a__LGS_GRP_oct_${name}`));
const FIELDS=['NOMENCLATU','PADRON','DEPARTAMEN','NRO_PLANO'];
const fail=message=>{throw new Error(message);};
const aborted=signal=>{if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');};
const position=p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;
const ring=r=>Array.isArray(r)&&r.length>=4&&r.every(position)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]&&new Set(r.slice(0,-1).map(p=>`${p[0]},${p[1]}`)).size>=3;
const polygon=p=>Array.isArray(p)&&p.length>0&&p.every(ring);
const geometry=g=>g&&(g.type==='Polygon'&&polygon(g.coordinates)||g.type==='MultiPolygon'&&Array.isArray(g.coordinates)&&g.coordinates.length>0&&g.coordinates.every(polygon));
function validBbox(bbox){return Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isFinite)&&bbox[0]>=-180&&bbox[2]<=180&&bbox[1]>=-90&&bbox[3]<=90&&bbox[0]<bbox[2]&&bbox[1]<bbox[3];}
function validCrs(crs){if(crs==null)return true;const name=crs?.properties?.name;return typeof name==='string'&&(/(?:^|[:/])4326$/i.test(name)||/(?:^|[:/])CRS84$/i.test(name));}

export function bboxForCoordinates(coords,padding=.002){
  if(!Number.isFinite(padding)||padding<0)fail('El margen geográfico debe ser un número positivo o cero.');
  const points=[];function visit(value){if(!Array.isArray(value))fail('Coordenadas del tramo inválidas.');if(typeof value[0]==='number'){if(!position(value))fail('Coordenadas fuera de WGS84.');points.push(value);}else for(const item of value)visit(item);}
  visit(coords);if(!points.length)fail('El tramo no contiene coordenadas.');
  let west=180,south=90,east=-180,north=-90;for(const [x,y]of points){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
  const bbox=[Math.max(-180,west-padding),Math.max(-90,south-padding),Math.min(180,east+padding),Math.min(90,north+padding)];
  if(!validBbox(bbox))fail('La extensión de consulta debe tener ancho y alto positivos.');return bbox;
}

async function requestPage(url,fetchImpl,signal){
  aborted(signal);const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetchImpl(url,{method:'GET',mode:'cors',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
    aborted(signal);if(!response.ok)fail(`El WFS respondió HTTP ${response.status}. No se completó la consulta.`);
    const body=await response.text();aborted(signal);
    if(/^\s*</.test(body))fail('El WFS devolvió HTML/XML o una excepción de servicio; no hay resultado catastral válido.');
    let page;try{page=JSON.parse(body);}catch{fail('El WFS no devolvió JSON válido.');}
    if(page?.type!=='FeatureCollection'||!Array.isArray(page.features)||!validCrs(page.crs))fail('Respuesta WFS incompatible: se requiere GeoJSON WGS84 longitud/latitud.');
    return page;
  }catch(error){if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');if(controller.signal.aborted)fail('Tiempo de espera agotado al consultar el WFS. Acotá el área y reintentá.');throw error;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}

export async function queryWfs({layers,bbox,signal,onProgress=()=>{},fetchImpl=globalThis.fetch,maxFeatures=5000,endpoint=WFS_ENDPOINT}={}){
  if(endpoint!==WFS_ENDPOINT)fail('Sólo está habilitado el servicio WFS público de IDECAM.');
  if(!Array.isArray(layers)||!layers.length||new Set(layers).size!==layers.length||layers.some(layer=>!ALLOWED_WFS_LAYERS.includes(layer)))fail('Seleccioná capas parcelarias habilitadas y sin repetir.');
  if(!validBbox(bbox))fail('La consulta necesita bbox WGS84 [oeste, sur, este, norte].');
  if(!Number.isInteger(maxFeatures)||maxFeatures<1||maxFeatures>5000)fail('El límite de consulta debe estar entre 1 y 5.000 entidades.');
  if(typeof fetchImpl!=='function')fail('No hay cliente HTTP disponible.');
  aborted(signal);const features=[],layerResults=[];
  for(const layer of layers){
    let total=null,startIndex=0;const seen=new Set();
    do{
      aborted(signal);const params=new URLSearchParams({service:'WFS',version:'1.0.0',request:'GetFeature',typeName:layer,outputFormat:'application/json',srsName:'EPSG:4326',bbox:[...bbox,'EPSG:4326'].join(','),propertyName:['the_geom',...FIELDS].join(','),sortBy:'fid_1',maxFeatures:'500',startIndex:String(startIndex)});
      const page=await requestPage(`${endpoint}?${params}`,fetchImpl,signal),rawTotal=page.totalFeatures;
      const pageTotal=typeof rawTotal==='number'?rawTotal:typeof rawTotal==='string'&&/^\d+$/.test(rawTotal)?Number(rawTotal):NaN;
      if(!Number.isSafeInteger(pageTotal)||pageTotal<0)fail('El WFS no informó un total verificable. No se puede asegurar la paginación.');
      if(total!==null&&pageTotal!==total)fail('El total del WFS cambió entre páginas. Reintentá la consulta para evitar resultados incompletos.');
      total=pageTotal;if(features.length+(total-startIndex)>maxFeatures)fail('La consulta supera el límite de entidades. Acotá el área o elegí menos capas.');
      if(page.features.length>500||startIndex+page.features.length>total||!page.features.length&&startIndex<total)fail('El WFS devolvió una página incompleta o incoherente con su total.');
      for(const feature of page.features){
        const p=feature?.properties,id=feature?.id;
        if(feature?.type!=='Feature'||!p||typeof p.NOMENCLATU!=='string'||!p.NOMENCLATU.trim()||FIELDS.some(key=>p[key]!=null&&typeof p[key]!=='string')||!geometry(feature.geometry))fail('El WFS devolvió NC, atributos o geometría inválida. No se completó la consulta.');
        if(!['string','number'].includes(typeof id)||typeof id==='number'&&!Number.isFinite(id)||!String(id).length)fail('El WFS no informó identificadores estables para controlar la paginación.');
        if(seen.has(String(id)))fail('El WFS repitió entidades entre páginas. Se detuvo para evitar un resultado truncado.');seen.add(String(id));
        const properties=Object.fromEntries(FIELDS.filter(key=>p[key]!=null).map(key=>[key,p[key]]));
        properties.nc=p.NOMENCLATU.trim();properties.source_layer=layer;
        features.push({type:'Feature',id:`${layer}:${id}`,properties,geometry:{type:feature.geometry.type,coordinates:feature.geometry.coordinates}});
      }
      startIndex+=page.features.length;onProgress({layer,received:startIndex,total,allReceived:features.length,layersDone:layerResults.length,layersTotal:layers.length});
    }while(startIndex<total);
    layerResults.push({layer,total,received:startIndex,query_complete:true});
  }
  aborted(signal);return {type:'FeatureCollection',features,metadata:{endpoint,layers:[...layers],bbox:[...bbox],crs:'EPSG:4326',wfs_version:'1.0.0',axis_order:'longitude_latitude',fetched_at:new Date().toISOString(),source_date:'unknown',query_complete:true,truncated:false,coverage_status:'unknown',query_scope:'requested_bbox_and_layers_only',layer_results:layerResults,privacy:'local_browser_response_not_uploaded',owner_status:'not_available_in_selected_schema'}};
}
