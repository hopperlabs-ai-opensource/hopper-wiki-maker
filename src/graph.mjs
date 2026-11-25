import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {project,find,nodesAt,date,knowledge,latest} from './project.mjs';
export {project,find,nodesAt,date,knowledge};
export function canonical(x) {
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(x && typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
export const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
export const head=g=>g.revisions.at(-1)?.id??null;
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kinds=['article','source','section','event','example','link'];
const text=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error('Missing '+label)};
function safeUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('Expected a public HTTPS URL');}
function validChange(c){
  if(typeof c.id!=='string'||!kinds.includes(c.id.split(':')[0])|| !slug.test(c.id.split(':').slice(1).join(':')))throw Error('Invalid graph ID '+c.id);
  date(c.from);if(c.until!=null && date(c.until)<=c.from)throw Error('Empty valid interval');
  const n=c.node;if(n===null)return;
  if(!n || n.kind!==c.id.split(':')[0] || ['id','from','recordedAt','revision'].some(k=>k in n))throw Error('Invalid node '+c.id);
  text(n.title,'title');if(n.kind==='source'){safeUrl(n.url);return;}
  if(n.kind==='article'){text(n.category,'category');for(const a of n.aliases||[])if(!slug.test(a))throw Error('Invalid alias');}
  else {if(n.kind==='event'){
    if(!Array.isArray(n.articles)||!n.articles.length)throw Error('Event needs subject articles');
    if(!/^\d{4}(?:-\d\d(?:-\d\d)?)?$/.test(n.date))throw Error('Invalid event date');
    const d=n.date.length===4?n.date+'-01-01':n.date.length===7?n.date+'-01':n.date;date(d);
    if(n.chronoscope)safeUrl(n.chronoscope);
  }else{text(n.article,'article reference');if(n.kind==='link')safeUrl(n.url);}
  if(n.kind==='section'||n.kind==='example')text(n.text,'text');
  if(!Array.isArray(n.sources)||!n.sources.length)throw Error('Evidence required for '+c.id);}
}
function checkReferences(nodes){
  const aliases=new Set([...nodes.keys()].filter(id=>id.startsWith('article:')).map(id=>id.slice(8)));
  for(const n of nodes.values()){
    for(const a of n.aliases||[]){if(aliases.has(a))throw Error('Ambiguous alias '+a);aliases.add(a);}
    for(const id of [...(n.sources||[]),...(n.articles||[]),...(n.article?[n.article]:[])]){
      const kind=(n.sources||[]).includes(id)?'source':'article';
      if(nodes.get(id)?.kind!==kind)throw Error('Unresolved '+kind+' '+id+' in '+n.id);
    }
  }
}
export function validate(g){
  if(g.schema!=='hopper.wiki-graph.v1'||!Array.isArray(g.revisions))throw Error('Invalid wiki graph');
  text(g.title,'wiki title');let parent=null,recorded='',allArticles=new Set();
  for(const r of g.revisions){
    const {id,...body}=r;if(id!==digest(body)||r.parent!==parent ||knowledge(r.recordedAt)!==r.recordedAt||r.recordedAt<=recorded)throw Error('Invalid revision chain or recorded time');
    text(r.message,'revision description');if(!Array.isArray(r.changes)||!r.changes.length)throw Error('Empty revision');
    const keys=new Set();for(const c of r.changes){validChange(c);const k=c.id+'@'+c.from;if(keys.has(k))throw Error('Duplicate change '+k);keys.add(k);if(c.node?.kind==='article')allArticles.add(c.id);}
    parent=id;recorded=r.recordedAt;
  }
  const times=new Set([latest]);let partial={...g,revisions:[]};
  for(const r of g.revisions){
    partial.revisions.push(r);for(const c of r.changes){times.add(c.from);if(c.until)times.add(c.until);for(const id of c.node?.related||[])if(!allArticles.has(id))throw Error('Unresolved related article '+id);}
    for(const t of times)checkReferences(nodesAt(partial,{validAt:t}));
  }
  return g;
}
export function initialize(title){text(title,'wiki title');return {schema:'hopper.wiki-graph.v1',title,revisions:[]};}
export function candidate(graph,proposal,recordedAt=new Date().toISOString()){
  if(!Object.hasOwn(proposal,'base')||proposal.base!==head(graph))throw Error('Base revision changed. Read the current head and review the diff.');
  const body={parent:proposal.base,recordedAt,message:proposal.message,changes:proposal.changes};
  const revision={id:digest(body),...body};
  validate({...graph,revisions:[...graph.revisions,revision]});return revision;
}
export function diff(graph,proposal){
  candidate(graph,proposal);
  return proposal.changes.map(c=>({id:c.id,from:c.from,until:c.until??null,before:nodesAt(graph,{validAt:c.from}).get(c.id)??null,after:c.node}));
}
export function load(file){return validate(JSON.parse(fs.readFileSync(file,'utf8')));}
export function publish(file,proposal){
  const lock=file+'.lock',fd=fs.openSync(lock,'wx'),tmp=file+'.'+randomUUID()+'.tmp';
  try{const g=load(file),r=candidate(g,proposal);g.revisions.push(r);
    fs.writeFileSync(tmp,JSON.stringify(g,null,2)+'\n',{flag:'wx',flush:true});fs.renameSync(tmp,file);return r.id;
  }finally{fs.closeSync(fd);fs.rmSync(tmp,{force:true});fs.unlinkSync(lock);}
}
export function create(file,title){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(initialize(title),null,2)+'\n',{flag:'wx'});}
