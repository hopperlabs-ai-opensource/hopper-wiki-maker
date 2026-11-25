import {project,find,nodesAt} from '../src/project.mjs';
import {esc,articleBody,markdown} from '../src/format.mjs';
const query=document.querySelector('#search');
query?.addEventListener('input',()=>{
 const term=query.value.trim().toLowerCase();let count=0;
 for(const card of document.querySelectorAll('.card')){card.hidden=!card.dataset.search.includes(term);if(!card.hidden)count++;}
 for(const g of document.querySelectorAll('.index-group'))g.hidden=![...g.querySelectorAll('.card')].some(c=>!c.hidden);
 document.querySelector('#results').textContent=term?count+' matching articles':'';
});
let loading;const graph=()=>loading??=fetch('/api/graph.json').then(r=>{if(!r.ok)throw Error('Graph unavailable');return r.json();}).catch(e=>{loading=null;throw e;});
const slug=document.querySelector('#main')?.dataset.slug;
const form=document.querySelector('#time-form'),box=document.querySelector('#timebox'),slider=document.querySelector('#scrubber');
const urls=[];
function blobLink(id,data,type){const u=URL.createObjectURL(new Blob([data],{type}));urls.push(u);const a=document.getElementById(id);a.href=u;a.download=slug+(id==='json'?'.json':'.md');}
async function refresh(){
 const params=new URLSearchParams(location.search),validAt=params.get('validAt'),knownAt=params.get('knownAt');
 const g=await graph(),p=project(g,slug,{...(validAt?{validAt}:{}),...(knownAt?{knownAt}:{})});
 const dates=[...new Set((project(g,slug,{knownAt:knownAt||undefined})?.events||[]).map(e=>e.date.length===4?e.date+'-12-31':e.date.length===7?new Date(Date.UTC(+e.date.slice(0,4),+e.date.slice(5),0)).toISOString().slice(0,10):e.date))].sort();
 const last=g.revisions.at(-1)?.recordedAt.slice(0,10);if(last&&!dates.includes(last))dates.push(last);dates.sort();
 form.validAt.value=validAt||'';form.knownAt.value=knownAt?(knownAt.length===10?knownAt+'T23:59:59.999':knownAt.replace(/Z$/,'')):'';
 slider.max=String(Math.max(0,dates.length-1));slider.disabled=dates.length<2;
 slider.value=String(validAt?Math.max(0,dates.findLastIndex(d=>d<=validAt)):dates.length-1);
 slider.oninput=()=>{form.validAt.value=dates[+slider.value];navigate(false);};
 document.querySelector('#date-label').textContent=[validAt?'Valid on '+validAt:'Latest facts',knownAt?'known by '+knownAt:''].filter(Boolean).join(' · ');
 document.querySelector('#projection').innerHTML=p?articleBody(p):'<div class="sparse"><h1>No article at these dates</h1><p>Choose a later event date or knowledge cutoff to see the available record.</p></div>';
 for(const u of urls.splice(0))URL.revokeObjectURL(u);
 for(const id of ['json','markdown'])document.getElementById(id).hidden=!p;
 if(p){blobLink('json',JSON.stringify(p,null,2),'application/json');blobLink('markdown',markdown(p),'text/markdown');}
 for(const link of document.querySelectorAll('#projection a[href^="/wiki/"],.library a[href^="/wiki/"]')){const url=new URL(link.href);url.search=params.toString();link.href=url.href;}
}
function showError(e){document.querySelector('#date-label').textContent='Unable to load this time view';document.querySelector('#projection').innerHTML='<p role="alert">'+esc(e.message)+'</p>';}
function navigate(push=true){const u=new URL(location.href);u.search='';if(form.validAt.value)u.searchParams.set('validAt',form.validAt.value);if(form.knownAt.value)u.searchParams.set('knownAt',new Date(form.knownAt.value+'Z').toISOString());history[push?'pushState':'replaceState']({},'',u);refresh().catch(showError);}
if(form){form.onsubmit=e=>{e.preventDefault();navigate();};document.querySelector('#reset').onclick=()=>{form.validAt.value='';form.knownAt.value='';navigate();};
 box.ontoggle=()=>{if(box.open)refresh().catch(showError);};
 if(location.search){box.open=true;refresh().catch(showError);}addEventListener('popstate',()=>refresh().catch(showError));}
if(navigator.modelContext?.registerTool){
 const tools=[
  {name:'wiki_search',description:'Search wiki articles by title or topic.',inputSchema:{type:'object',properties:{query:{type:'string'}}},execute:async a=>find(await graph(),a.query||'')},
  {name:'wiki_read',description:'Read a cited article with optional valid date and knowledge cutoff.',inputSchema:{type:'object',properties:{slug:{type:'string'},validAt:{type:'string'},knownAt:{type:'string'}},required:['slug']},execute:async a=>project(await graph(),a.slug,a)},
  {name:'wiki_changes',description:'Find published graph revisions after a UTC timestamp.',inputSchema:{type:'object',properties:{since:{type:'string'}}},execute:async a=>(await graph()).revisions.filter(r=>!a.since||r.recordedAt>a.since).map(({id,recordedAt,message})=>({id,recordedAt,message}))}
 ];for(const tool of tools){const run=tool.execute;try{navigator.modelContext.registerTool({...tool,execute:async args=>({content:[{type:'text',text:JSON.stringify(await run(args))}]})});}catch(error){console.warn('Wiki browser tool registration failed',tool.name,error.message);}}
}
