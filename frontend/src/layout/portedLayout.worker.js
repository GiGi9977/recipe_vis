import {runPortedLayout} from "./portedLayout";

self.onmessage=event=>{
  try{
    self.postMessage({ok:true,coordinates:runPortedLayout(event.data)});
  }catch(error){
    self.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
