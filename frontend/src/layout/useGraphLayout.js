import {useEffect,useState} from "react";
import {runLayout} from "./safeLayout";

const pending=graph=>({graph,status:graph?"loading":"idle",layout:null,error:null});

export function useGraphLayout(graph,mode="established"){
  const[state,setState]=useState(()=>pending(graph));
  useEffect(()=>{
    if(!graph){setState(pending(null));return;}
    let active=true;
    setState(pending(graph));
    runLayout(graph,mode)
      .then(layout=>active&&setState({graph,status:"success",layout,error:null}))
      .catch(error=>active&&setState({graph,status:"error",layout:null,error}));
    return()=>{active=false};
  },[graph,mode]);
  // A new graph renders before this effect resets state. Do not expose the
  // previous graph's coordinates during that render.
  return state.graph===graph?state:pending(graph);
}
