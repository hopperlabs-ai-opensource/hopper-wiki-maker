import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialize,candidate,project,validate,publish,create,load} from '../src/graph.mjs';
import {exportWiki} from '../src/site.mjs';
const changes=[
 {id:'source:catalog',from:'1980-01-01',node:{kind:'source',title:'NASA Voyager mission',url:'https://science.nasa.gov/mission/voyager/'}},
 {id:'article:voyager',from:'1980-01-01',node:{kind:'article',title:'Voyager',category:'Spaceflight',related:[],sources:['source:catalog']}},
 {id:'event:encounter',from:'1980-11-12',node:{kind:'event',articles:['article:voyager'],title:'Voyager 1 encounters Saturn',date:'1980-11-12',sources:['source:catalog']}}
];
test('late correction preserves valid and recorded history, including interval ends',()=>{
 const g=initialize('Space wiki'),r=candidate(g,{base:null,message:'Archive',changes},'2026-01-01T10:00:00.000Z');g.revisions.push(r);
 const fix={...changes[2],until:'1980-12-01',node:{...changes[2].node,title:'Voyager 1 flies past Saturn'}};
 g.revisions.push(candidate(g,{base:r.id,message:'Clarify encounter',changes:[fix]},'2026-01-02T10:00:00.000Z'));
 assert.equal(project(g,'voyager',{validAt:'1980-11-01'}).events.length,0);
 assert.equal(project(g,'voyager',{validAt:'1980-11-12',knownAt:'2026-01-01'}).events[0].title,changes[2].node.title);
 assert.equal(project(g,'voyager',{validAt:'1980-11-12'}).events[0].title,fix.node.title);
 assert.equal(project(g,'voyager',{validAt:'1980-12-01'}).events[0].title,changes[2].node.title);
 assert.equal(project(g,'voyager',{knownAt:'2025-12-31'}),null);
 assert.throws(()=>candidate(g,{base:null,message:'stale',changes}));
 g.revisions[0].message='edited';assert.throws(()=>validate(g));
});
test('fresh graph exports another topic with working citations, timeline and agent records',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'wiki-release-'));try{
  const file=path.join(dir,'wiki.json');create(file,'Spaceflight');const proposal={base:null,message:'Add encounter',changes};
  assert.throws(()=>publish(file,{...proposal,changes:changes.slice(1)}));
  publish(file,proposal);assert.throws(()=>publish(file,proposal));const out=path.join(dir,'dist');exportWiki(load(file),out);
  assert.match(readFileSync(path.join(out,'timeline/index.html'),'utf8'),/Voyager 1 encounters Saturn/);
  assert.match(readFileSync(path.join(out,'api/articles/voyager.md'),'utf8'),/science.nasa.gov/);
  assert.equal(JSON.parse(readFileSync(path.join(out,'api/timeline.json'))).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
