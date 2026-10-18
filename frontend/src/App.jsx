import React,{useEffect,useRef,useState} from "react";
import {compareRecipes,listRecipes} from "./api";
import {stepKeys} from "./graph";
import GraphCanvas from "./components/GraphCanvas";
import TextPanel from "./components/TextPanel";
export default function App(){
  const[recipes,setRecipes]=useState([]),[r1,setR1]=useState(""),[r2,setR2]=useState(""),[graph,setGraph]=useState(null),[status,setStatus]=useState("idle"),[error,setError]=useState(""),[selected,setSelected]=useState(new Set()),[layoutMode,setLayoutMode]=useState(()=>localStorage.getItem("recipe-vis-layout")||"auto");
  const abort=useRef();
  async function loadComparison(recipe1,recipe2){
    if(!recipe1||!recipe2)return;
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    setStatus("loading");setError("");setSelected(new Set());
    try{const result=await compareRecipes(recipe1,recipe2,controller.signal);setGraph(result.graph);setStatus("success");localStorage.setItem("recipe-vis-pair",JSON.stringify([recipe1,recipe2]));}
    catch(e){if(e.name!=="AbortError"){setError(e.message);setStatus("error");}}
  }
  useEffect(()=>{let active=true;listRecipes().then(items=>{if(!active)return;setRecipes(items);let saved=[];try{saved=JSON.parse(localStorage.getItem("recipe-vis-pair")||"[]");}catch{}const ids=new Set(items.map(item=>item.id)),recipe1=ids.has(saved[0])?saved[0]:items[0]?.id||"",recipe2=ids.has(saved[1])?saved[1]:items[1]?.id||items[0]?.id||"";setR1(recipe1);setR2(recipe2);loadComparison(recipe1,recipe2);}).catch(e=>{if(active){setError(e.message);setStatus("error");}});return()=>{active=false;abort.current?.abort();};},[]);
  function chooseR1(value){setR1(value);localStorage.setItem("recipe-vis-pair",JSON.stringify([value,r2]));}
  function chooseLayout(value){setLayoutMode(value);localStorage.setItem("recipe-vis-layout",value);}
  function chooseR2(value){setR2(value);localStorage.setItem("recipe-vis-pair",JSON.stringify([r1,value]));}
  function selectItem(item){setSelected(new Set(stepKeys(item)));}
  return <main><header><div className="brand"><span>Beyond linear recipes</span><h1>Recipe Comparison</h1></div><div className="controls"><label>Recipe 1<select value={r1} onChange={e=>chooseR1(e.target.value)}>{recipes.map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.label}</option>)}</select></label><label>Recipe 2<select value={r2} onChange={e=>chooseR2(e.target.value)}>{recipes.map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.label}</option>)}</select></label><label>Layout<select value={layoutMode} onChange={e=>chooseLayout(e.target.value)}><option value="auto">Auto (ELK)</option><option value="established">Established</option></select></label><button onClick={()=>loadComparison(r1,r2)} disabled={status==="loading"||!r1||!r2}>{status==="loading"?"Comparing…":"Compare"}</button></div></header>{error&&<div className="notice error">{error}</div>}{status==="loading"&&!graph&&<div className="notice">Building comparison…</div>}{!graph&&status==="idle"&&!error&&<div className="notice">Loading recipes…</div>}{graph&&<div className="workspace"><GraphCanvas graph={graph} selected={selected} onSelect={selectItem} layoutMode={layoutMode}/><TextPanel alignment={graph.text_alignment} selected={selected} onSelect={setSelected}/></div>}</main>;
}
