import {buildStudyBuffer,intersectStudyCandidates} from './study-buffer.mjs';
import {clipParcelSnapshot} from './parcel-snapshot.mjs';

self.onmessage=event=>{
  const {type,revision}=event.data||{};
  try{
    if(type==='buffer'){
      const buffer=buildStudyBuffer(event.data.feature,event.data.radius??100);
      self.postMessage({type:'buffer',buffer,revision});
    }else if(type==='snapshot'){
      const result=clipParcelSnapshot(event.data.snapshot,event.data.buffer,{routeId:event.data.buffer.properties.route_id,revision,onProgress:(done,total)=>{if(done%25===0||done===total)self.postMessage({type:'progress',operation:'snapshot',done,total,revision});}});
      self.postMessage({type:'snapshot',result,revision});
    }else if(type==='parcel'){
      const corridor=event.data.buffer||event.data.corridorFeatureCollection||event.data.corridors;
      const result=intersectStudyCandidates(event.data.candidates,corridor,revision,(done,total)=>{
        if(done%25===0||done===total)self.postMessage({type:'progress',operation:'parcel',done,total,revision});
      });
      self.postMessage({type:'parcel',result,revision});
    }else throw Error('Operación de estudio desconocida.');
  }catch(error){self.postMessage({type:'error',operation:type,message:error.message,revision});}
};
