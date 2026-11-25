export const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const href=slug=>'/wiki/'+encodeURIComponent(slug)+'/';
const markup=s=>esc(s).replace(/`([^`\n]+)`/g,'<code>$1</code>');
const anchor=s=>s.replace(/^[^:]+:/,'');
export function markdown(p){
  const cite=n=>(n.sources||[]).map(id=>{const s=p.sources.find(x=>x.id===id);return s?'['+s.title+']('+s.url+')':''}).join(' · ');
  return ['# '+p.article.title,p.article.summary||'',cite(p.article),...p.sections.map(n=>'## '+n.title+'\n\n'+n.text+'\n\n'+cite(n)),...p.examples.map(n=>'## '+n.title+'\n\n'+n.text+(n.code?'\n\n```\n'+n.code+'\n```':'')+'\n\n'+cite(n)),'## Timeline',...p.events.map(n=>'- '+n.date+' — '+n.title+' '+cite(n)+(n.chronoscope?' · [Chronoscope]('+n.chronoscope+')':'')),...p.links.map(n=>'['+n.title+']('+n.url+')'),'## Related articles',...[...p.related,...p.backlinks].filter((x,i,a)=>a.findIndex(v=>v.slug===x.slug)===i).map(n=>'['+n.title+']('+href(n.slug)+')')].filter(Boolean).join('\n\n')+'\n';
}
export function articleBody(p){
  const a=p.article;
  const refs=n=>(n.sources||[]).map(id=>{const i=p.sources.findIndex(s=>s.id===id);return i<0?'':' <a class="ref" href="#src-'+i+'" aria-label="Source '+(i+1)+'">['+(i+1)+']</a>';}).join('');
  function diagram(n){
    if(!n.steps?.length)return '';
    return '<div class="diagram" aria-label="'+esc(n.title)+' walkthrough">'+n.steps.map((step,i)=>'<details '+(!i?'open':'')+'><summary><span>'+String(i+1).padStart(2,'0')+'</span>'+esc(step.label)+'</summary><p>'+esc(step.text)+'</p></details>').join('')+'</div>';
  }
  const sections=p.sections.map(n=>'<section id="'+anchor(n.id)+'"><h2>'+esc(n.title)+'</h2><p>'+markup(n.text)+refs(n)+'</p>'+diagram(n)+'</section>').join('');
  const examples=p.examples.length?'<section id="examples"><h2>Examples</h2>'+p.examples.map(n=>'<details class="example" '+(n.order===0?'open':'')+'><summary>'+esc(n.title)+'</summary><p>'+markup(n.text)+refs(n)+'</p>'+(n.code?'<pre><code>'+esc(n.code)+'</code></pre>':'')+'</details>').join('')+'</section>':'';
  const events=p.events.length?'<section id="timeline"><h2>Timeline</h2><ol class="events">'+p.events.map(n=>'<li><time>'+esc(n.date)+'</time><div>'+esc(n.title)+refs(n)+(n.detail?'<p>'+esc(n.detail)+'</p>':'')+(n.chronoscope?' <a class="chrono" href="'+esc(n.chronoscope)+'">Chronoscope</a>':'')+'</div></li>').join('')+'</ol></section>':'';
  const links=p.links.length?'<section id="practice"><h2>Code and practice</h2><ul>'+p.links.map(n=>'<li><a href="'+esc(n.url)+'">'+esc(n.title)+'</a></li>').join('')+'</ul></section>':'';
  const relations=(title,list)=>list.length?'<section><h2>'+title+'</h2><div class="relations">'+list.map(n=>'<a href="'+href(n.slug)+'">'+esc(n.title)+'</a>').join('')+'</div></section>':'';
  const revisions=p.history.slice().reverse().map(r=>'<li><a href="?knownAt='+encodeURIComponent(r.recordedAt)+'">'+esc(r.recordedAt.slice(0,10))+'</a> '+esc(r.message)+' <code>'+esc(r.id.slice(0,9))+'</code> · <a href="/api/diffs/'+r.id+'.json">View changes</a></li>').join('');
  const sources=p.sources.map((n,i)=>'<li id="src-'+i+'"><a href="'+esc(n.url)+'">'+esc(n.title)+'</a> <small>'+esc(new URL(n.url).hostname)+'</small></li>').join('');
  const toc=[...p.sections.map(n=>[anchor(n.id),n.title]),...(examples?[['examples','Examples']]:[]),...(events?[['timeline','Timeline']]:[]),...(links?[['practice','Code and practice']]:[]),['references','References'],['revisions','Revision history']];
  return '<div class="reading"><article><header class="article-title"><p class="kicker">'+esc(a.category)+'</p><h1>'+esc(a.title)+'</h1>'+(a.summary?'<p class="lead">'+markup(a.summary)+refs(a)+'</p>':'')+'</header>'+sections+examples+events+links+relations('Related articles',p.related)+relations('Linked from',p.backlinks)+'<section id="references"><h2>References</h2><ol class="sources">'+sources+'</ol></section><details id="revisions"><summary>Revision history</summary><ul>'+revisions+'</ul></details></article><aside class="contents"><p>On this page</p>'+toc.map(([id,label])=>'<a href="#'+id+'">'+esc(label)+'</a>').join('')+'</aside></div>';
}
export function indexBody(items){
 const categories=[...new Set(items.map(i=>i.category))];
 return '<div class="index"><header><p class="kicker">Subject index</p><h1>Explore the wiki</h1><p class="lead">Follow a subject through its sources, practical examples and history.</p></header><label class="search">Find an article<input id="search" type="search" placeholder="Search by title or subject" autocomplete="off"></label><p role="status" id="results"></p>'+categories.map(cat=>'<section class="index-group"><h2>'+esc(cat)+'</h2><div class="cards">'+items.filter(i=>i.category===cat).map(i=>'<a class="card" href="'+href(i.slug)+'" data-search="'+esc((i.title+' '+i.category+' '+i.slug).toLowerCase())+'"><strong>'+esc(i.title)+'</strong><span>'+esc(i.description||'')+'</span></a>').join('')+'</div></section>').join('')+'</div>';
}
export function shell(site,items,content,slug='',bounds={}){
 const groups=[...new Set(items.map(i=>i.category))];
 const nav=groups.map(cat=>'<details '+(items.some(i=>i.slug===slug&&i.category===cat)||!slug?'open':'')+'><summary>'+esc(cat)+'</summary>'+items.filter(x=>x.category===cat).map(i=>'<a '+(slug===i.slug?'aria-current="page" ':'')+'href="'+href(i.slug)+'">'+esc(i.title)+'</a>').join('')+'</details>').join('');
 const controls=slug?'<details class="timebox" id="timebox"><summary>Time view <span id="date-label">Latest revision</span></summary><form id="time-form"><label>Facts valid on<input name="validAt" type="date"></label><label>Wiki knew by (UTC)<input name="knownAt" type="datetime-local" step="0.001"></label><label class="scrub">Explore milestones<input id="scrubber" type="range" min="0" max="0" value="0" disabled></label><button>Apply dates</button><button type="button" id="reset">Latest</button></form><p>Event dates describe the subject. The knowledge cutoff controls which editorial revisions you can see.</p></details>':'';
 const exports=slug?'<div class="exports"><a id="json" href="/api/articles/'+slug+'.json">JSON</a><a id="markdown" href="/api/articles/'+slug+'.md">Markdown</a></div>':'<div class="exports"><a href="/feed.json">Change feed</a><a href="/llms.txt">For agents</a></div>';
 return '<a class="skip" href="#main">Skip to content</a><header class="mast"><a class="wordmark" href="/"><span class="glyph" aria-hidden="true">W</span>'+esc(site)+'</a><nav><a href="/">Index</a><a href="/timeline/">Timeline</a><a href="/llms.txt">For agents</a></nav></header><div class="frame"><aside class="library"><a class="indexlink" href="/">Article index</a>'+nav+'</aside><main id="main" data-slug="'+esc(slug)+'"><div class="bar"><a href="/">Wiki index</a>'+exports+'</div>'+controls+'<div id="projection">'+content+'</div></main></div><footer>'+esc(site)+' · <a href="/feed.json">Revision feed</a></footer>';
}
