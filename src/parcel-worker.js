import{intersectCandidates}from'./parcel-intersection.mjs';
self.onmessage=event=>{try{const result=intersectCandidates(event.data.candidates,event.data.corridors,(done,total)=>{if(done%25===0||done===total)self.postMessage({type:'progress',done,total});});self.postMessage({type:'result',result});}catch(error){self.postMessage({type:'error',message:error.message});}};
