// This module is shared by the CLI, static builder and browser. All times are UTC.
export const latest = '9999-12-31';
export const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function date(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw Error('Expected ISO date');
  return value;
}
export function knowledge(value) {
  if(value == null || value === '')return '9999-12-31T23:59:59.999Z';
  if(value.length===10)return date(value)+'T23:59:59.999Z';
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Expected a UTC timestamp');
  return value;
}
export function nodesAt(graph,{validAt=new Date().toISOString().slice(0,10),knownAt}={}) {
  date(validAt);const cutoff=knowledge(knownAt), nodes=new Map();
  for(const revision of graph.revisions) {
    if(revision.recordedAt>cutoff)break;
    for(const change of revision.changes) {
      if(change.from<=validAt && (!change.until || validAt<change.until)) {
        if(change.node===null)nodes.delete(change.id);
        else nodes.set(change.id,{...change.node,id:change.id,from:change.from,revision:revision.id,recordedAt:revision.recordedAt});
      }
    }
  }
  return nodes;
}
export function project(graph,slug,options={}) {
  const nodes=nodesAt(graph,options);const articles=[...nodes.values()].filter(n=>n.kind==='article');
  const article=articles.find(a=>a.id==='article:'+slug || a.aliases?.includes(slug));
  if(!article)return null;
  const owned=[...nodes.values()].filter(n=>n.article===article.id || n.articles?.includes(article.id));
  const orderByPosition=(a,b)=>(a.order??0)-(b.order??0)||order(a.id,b.id);
  const sections=owned.filter(n=>n.kind==='section').sort(orderByPosition);
  const events=owned.filter(n=>n.kind==='event').sort((a,b)=>order(a.date,b.date)||order(a.id,b.id));
  const examples=owned.filter(n=>n.kind==='example').sort(orderByPosition);
  const links=owned.filter(n=>n.kind==='link').sort(orderByPosition);
  const relation=n=>({slug:n.id.slice(8),title:n.title});
  const related=(article.related||[]).map(id=>nodes.get(id)).filter(Boolean).map(relation);
  const backlinks=articles.filter(n=>n.related?.includes(article.id)).map(relation);
  const cited=new Set([article,...sections,...events,...examples,...links].flatMap(n=>n.sources||[]));
  const sources=[...cited].map(id=>nodes.get(id)).filter(Boolean);
  const history=graph.revisions.filter(r=>r.recordedAt<=knowledge(options.knownAt)&&r.changes.some(c=>c.id===article.id || c.node?.article===article.id || c.node?.articles?.includes(article.id))).map(r=>({id:r.id,recordedAt:r.recordedAt,message:r.message}));
  return {slug:article.id.slice(8),article,sections,events,examples,links,sources,related,backlinks,history};
}
export function find(graph,query='',opts={}) {
  const term=query.trim().toLowerCase();
  return [...nodesAt(graph,opts).values()].filter(n=>n.kind==='article' && [n.title,n.category,...n.aliases||[]].join(' ').toLowerCase().includes(term))
    .sort((a,b)=>order(a.title,b.title)).map(n=>({slug:n.id.slice(8),title:n.title,category:n.category}));
}
