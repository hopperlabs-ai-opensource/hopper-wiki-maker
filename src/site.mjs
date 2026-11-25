import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {find,project,validate,head,nodesAt} from './graph.mjs';
import {esc,href,indexBody,articleBody,markdown,shell} from './format.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const save=(dir,file,body)=>{const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);};
export function exportWiki(graph,dir,{origin=''}={}){
  validate(graph);const releaseView={validAt:(graph.revisions.at(-1)?.recordedAt||'1970-01-01').slice(0,10)};const file=(name,body)=>save(dir,name,body);const json=(name,obj)=>file(name,JSON.stringify(obj)+'\n');
  const items=find(graph,'',releaseView).map(i=>({...i,description:project(graph,i.slug,releaseView).article.summary||''}));
  const pages=[];
  function page(route,title,description,body,slug=''){
    const inner=shell(graph.title,items,body,slug);pages.push({route,title,description,html:inner});
    file(route.slice(1)+'index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(title)+' · '+esc(graph.title)+'</title><meta name="description" content="'+esc(description)+'"><link rel="stylesheet" href="/assets/wiki.css"><script type="module" src="/assets/wiki.mjs"></script></head><body>'+inner+'</body></html>');
  }
  page('/',graph.title,'Browse cited articles, examples and dated events.',indexBody(items));
  for(const i of items){
    const p=project(graph,i.slug,releaseView);page(href(i.slug),i.title,i.description||i.title,articleBody(p),i.slug);
    json('api/articles/'+i.slug+'.json',p);file('api/articles/'+i.slug+'.md',markdown(p));
    for(const a of p.article.aliases||[]){file('wiki/'+a+'/index.html','<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url='+href(i.slug)+'"><a href="'+href(i.slug)+'">'+esc(i.title)+'</a>');}
  }
  const events=[...nodesAt(graph,releaseView).values()].filter(n=>n.kind==='event').sort((a,b)=>b.date.localeCompare(a.date));
  const titles=new Map(items.map(i=>['article:'+i.slug,i]));
  page('/timeline/','Timeline','Shared dated milestones across the wiki.','<header><p class="kicker">Across subjects</p><h1>Timeline</h1></header><ol class="events">'+events.map(n=>'<li><time>'+esc(n.date)+'</time><div>'+esc(n.title)+'<div>'+n.articles.map(id=>'<a href="'+href(titles.get(id).slug)+'#timeline">'+esc(titles.get(id).title)+'</a>').join(' · ')+'</div></div></li>').join('')+'</ol>');
  json('api/index.json',{title:graph.title,revision:head(graph),articles:items,timeline:'/api/timeline.json',graph:'/api/graph.json',feed:'/feed.json'});
  json('api/graph.json',graph);json('api/timeline.json',events);
  json('feed.json',{version:'https://jsonfeed.org/version/1.1',title:graph.title+' revisions',home_page_url:origin+'/',feed_url:origin+'/feed.json',items:[...graph.revisions].reverse().map(r=>({id:r.id,title:r.message,date_published:r.recordedAt,url:origin+'/api/revisions/'+r.id+'.json',content_text:r.changes.length+' graph changes',_articles:[...new Set(r.changes.flatMap(c=>[...(c.id.startsWith('article:')?[c.id]:[]),...c.node?.articles||[],...c.node?.article?[c.node.article]:[]]))]}))});
  const earlier={...graph,revisions:[]};
  for(const r of graph.revisions){
    json('api/revisions/'+r.id+'.json',r);
    json('api/diffs/'+r.id+'.json',r.changes.map(c=>({id:c.id,from:c.from,until:c.until??null,before:nodesAt(earlier,{validAt:c.from}).get(c.id)??null,after:c.node})));
    earlier.revisions.push(r);
  }
  for(const category of new Set(items.map(i=>i.category))){
    const listed=items.filter(i=>i.category===category),ids=new Set(listed.map(i=>'article:'+i.slug));
    const key=category.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    json('api/collections/'+key+'.json',{category,revision:head(graph),articles:listed,events:events.filter(n=>n.articles.some(id=>ids.has(id)))});
  }
  file('llms.txt','# '+graph.title+'\n\n- [Article index]('+origin+'/api/index.json)\n- [Bitemporal graph]('+origin+'/api/graph.json)\n- [Event timeline]('+origin+'/api/timeline.json)\n- [Change feed]('+origin+'/feed.json)\n\n'+items.map(i=>'- ['+i.title+']('+origin+'/api/articles/'+i.slug+'.md)').join('\n')+'\n');
  for(const [source,name] of [['web/wiki.css','wiki.css'],['web/wiki.mjs','wiki.mjs'],['src/project.mjs','project.mjs'],['src/format.mjs','format.mjs']]) {const bytes=fs.readFileSync(path.join(root,source),'utf8');file('assets/'+name,name==='wiki.mjs'?bytes.replaceAll("from '../src/","from './"):bytes);}
  return pages;
}
