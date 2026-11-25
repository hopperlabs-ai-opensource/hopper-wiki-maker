import { slugKey, formatEventDate, eventYearLabel } from './project.mjs';

export const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const href = slug => '/wiki/' + encodeURIComponent(slug) + '/';
export const collectionHref = cat => '/collections/' + encodeURIComponent(slugKey(cat)) + '/';
const markup = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>');
const anchor = s => s.replace(/^[^:]+:/, '');

const relLabels = {
  powers: 'Powers',
  uses: 'Uses',
  'built-with': 'Built with',
  'part-of': 'Part of',
  chronicles: 'Chronicles',
  'covered-in': 'Covered in',
  implements: 'Implements',
  maintains: 'Maintains',
  'documented-in': 'Documented in',
  related: 'Related articles',
};

const entityLabels = {
  site: 'Site',
  app: 'App',
  package: 'Open Source',
  pattern: 'Pattern',
  concept: 'Concept',
  person: 'Person',
  organization: 'Organization',
  model: 'Model',
  collection: 'Chronoscope Pack',
  topic: 'Topic',
  workshop: 'Workshop',
  'math-problem': 'Mathematics',
};

const humanRel = (rel) => relLabels[rel] || rel.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
const humanEntity = (t) => entityLabels[t] || t.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

export function markdown(p) {
  const cite = n => (n.sources || []).map(id => { const s = p.sources.find(x => x.id === id); return s ? '[' + s.title + '](' + s.url + ')' : ''; }).filter(Boolean).join(' · ');
  const meta = [
    p.article.entityType ? `Type: ${humanEntity(p.article.entityType)}` : '',
    p.article.homepage ? `Live URL: ${p.article.homepage}` : '',
  ].filter(Boolean).join(' · ');
  const relLines = [...p.related, ...p.backlinks]
    .filter((x, i, a) => a.findIndex(v => v.slug === x.slug) === i)
    .map(n => `- [${n.title}](${href(n.slug)})${n.rel && n.rel !== 'related' ? ' (' + n.rel + ')' : ''}`);
  return [
    '# ' + p.article.title,
    meta,
    p.article.summary || '',
    cite(p.article),
    ...p.sections.map(n => '## ' + n.title + '\n\n' + n.text + '\n\n' + cite(n)),
    ...p.examples.map(n => '## ' + n.title + '\n\n' + n.text + (n.code ? '\n\n```\n' + n.code + '\n```' : '') + '\n\n' + cite(n)),
    ...(p.events.length ? ['## Timeline', ...p.events.map(n => '- ' + formatEventDate(n.date) + ' — ' + n.title + ' ' + cite(n) + (n.chronoscope ? ' · [Chronoscope](' + n.chronoscope + ')' : ''))] : []),
    ...p.links.map(n => '[' + n.title + '](' + n.url + ')'),
    ...(relLines.length ? ['## Related articles', relLines.join('\n')] : []),
  ].filter(Boolean).join('\n\n') + '\n';
}

function neighborhoodSvg(p) {
  const neighbors = [];
  const seen = new Set();
  for (const n of p.related) {
    if (seen.has(n.slug)) continue;
    seen.add(n.slug);
    neighbors.push({ ...n, dir: 'out' });
  }
  for (const n of p.backlinks) {
    if (seen.has(n.slug)) continue;
    seen.add(n.slug);
    neighbors.push({ ...n, dir: 'in' });
  }
  if (!neighbors.length) return '';
  const shown = neighbors.slice(0, 10);
  const W = 640, H = shown.length <= 4 ? 220 : 280;
  const cx = W / 2, cy = H / 2;
  const rx = 210, ry = H / 2 - 36;
  const lines = [];
  const nodes = [];
  shown.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / shown.length - Math.PI / 2;
    const x = Math.round(cx + rx * Math.cos(angle));
    const y = Math.round(cy + ry * Math.sin(angle));
    const label = n.title.length > 22 ? n.title.slice(0, 20) + '…' : n.title;
    lines.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="gm-edge gm-${n.dir}"/>`);
    const anchorPos = x < cx - 30 ? 'end' : x > cx + 30 ? 'start' : 'middle';
    const tx = x < cx - 30 ? x - 10 : x > cx + 30 ? x + 10 : x;
    const ty = x < cx - 30 || x > cx + 30 ? y + 4 : (y < cy ? y - 12 : y + 18);
    nodes.push(`<a href="${href(n.slug)}" class="gm-node"><circle cx="${x}" cy="${y}" r="6" class="gm-dot gm-${n.dir}"/><text x="${tx}" y="${ty}" text-anchor="${anchorPos}">${esc(label)}</text></a>`);
  });
  const centerLabel = p.article.title.length > 24 ? p.article.title.slice(0, 22) + '…' : p.article.title;
  const extra = neighbors.length > shown.length ? ` (+${neighbors.length - shown.length} more in Graph Explorer)` : '';
  return `<figure class="graph-map"><figcaption>Graph neighborhood · <a href="/graph/#${encodeURIComponent(p.slug)}">Open full Graph Explorer</a>${esc(extra)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Connections around ${esc(p.article.title)}">${lines.join('')}${nodes.join('')}<g class="gm-center"><circle cx="${cx}" cy="${cy}" r="9"/><text x="${cx}" y="${cy + 24}" text-anchor="middle">${esc(centerLabel)}</text></g></svg></figure>`;
}

export function articleBody(p) {
  const a = p.article;
  const refs = n => (n.sources || []).map(id => {
    const i = p.sources.findIndex(s => s.id === id);
    return i < 0 ? '' : ' <a class="ref" href="#src-' + i + '" aria-label="Source ' + (i + 1) + '">[' + (i + 1) + ']</a>';
  }).join('');
  function diagram(n) {
    if (!n.steps?.length) return '';
    return '<div class="diagram" aria-label="' + esc(n.title) + ' walkthrough">' + n.steps.map((step, i) => '<details ' + (!i ? 'open' : '') + '><summary><span>' + String(i + 1).padStart(2, '0') + '</span>' + esc(step.label) + '</summary><p>' + esc(step.text) + '</p></details>').join('') + '</div>';
  }
  const sections = p.sections.map(n => '<section id="' + anchor(n.id) + '"><h2>' + esc(n.title) + '</h2><p>' + markup(n.text) + refs(n) + '</p>' + diagram(n) + '</section>').join('');
  const examples = p.examples.length ? '<section id="examples"><h2>Examples</h2>' + p.examples.map(n => '<details class="example" ' + (n.order === 0 ? 'open' : '') + '><summary>' + esc(n.title) + '</summary><p>' + markup(n.text) + refs(n) + '</p>' + (n.code ? '<pre><code>' + esc(n.code) + '</code></pre>' : '') + '</details>').join('') + '</section>' : '';
  const years = new Map();
  for (const event of p.events) {
    const year = eventYearLabel(event.date);
    years.set(year, (years.get(year) || 0) + 1);
  }
  const counts = [...years], maximum = Math.max(1, ...years.values());
  const distribution = counts.length > 1 && p.events.length >= 3 && counts.length <= 14
    ? '<figure class="milestones"><figcaption>Documented milestones by year</figcaption>' + counts.map(([year, count]) => '<div><span>' + esc(year) + '</span><meter min="0" max="' + maximum + '" value="' + count + '" aria-label="' + count + ' documented milestones in ' + esc(year) + '"></meter><b>' + count + '</b></div>').join('') + '</figure>' : '';
  const events = p.events.length ? '<section id="timeline"><h2>Timeline</h2>' + distribution + '<ol class="events">' + p.events.map(n => '<li><time>' + esc(formatEventDate(n.date)) + '</time><div>' + esc(n.title) + refs(n) + (n.detail ? '<p>' + esc(n.detail) + '</p>' : '') + (n.chronoscope ? ' <a class="chrono" href="' + esc(n.chronoscope) + '">Chronoscope</a>' : '') + '</div></li>').join('') + '</ol></section>' : '';
  const links = p.links.length ? '<section id="practice"><h2>Code and practice</h2><ul>' + p.links.map(n => '<li><a href="' + esc(n.url) + '">' + esc(n.title) + '</a></li>').join('') + '</ul></section>' : '';

  // Group outgoing typed relations cleanly
  let relatedHtml = '';
  if (p.related.length) {
    const grouped = new Map();
    for (const r of p.related) {
      const k = r.rel || 'related';
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(r);
    }
    if (grouped.size === 1 && grouped.has('related')) {
      relatedHtml = '<section id="connections"><h2>Related articles</h2><div class="relations">' + p.related.map(n => '<a href="' + href(n.slug) + '">' + esc(n.title) + '</a>').join('') + '</div></section>';
    } else {
      relatedHtml = '<section id="connections"><h2>Connections</h2>' + [...grouped.entries()].map(([rel, list]) => '<div class="rel-group"><h3>' + esc(humanRel(rel)) + '</h3><div class="relations">' + list.map(n => '<a href="' + href(n.slug) + '">' + esc(n.title) + '</a>').join('') + '</div></div>').join('') + '</section>';
    }
  }
  const backlinksHtml = p.backlinks.length ? '<section><h2>Linked from</h2><div class="relations">' + p.backlinks.slice(0, 36).map(n => '<a href="' + href(n.slug) + '">' + esc(n.title) + '</a>').join('') + (p.backlinks.length > 36 ? '<a class="more-link" href="/graph/#' + encodeURIComponent(p.slug) + '">+' + (p.backlinks.length - 36) + ' more in graph</a>' : '') + '</div></section>' : '';
  const graphMap = neighborhoodSvg(p);

  const revisions = p.history.slice().reverse().map(r => '<li><a href="?knownAt=' + encodeURIComponent(r.recordedAt) + '">' + esc(r.recordedAt.slice(0, 10)) + '</a> ' + esc(r.message) + ' <code>' + esc(r.id.slice(0, 9)) + '</code> · <a href="/api/diffs/' + r.id + '.json">View changes</a></li>').join('');
  const sources = p.sources.map((n, i) => '<li id="src-' + i + '"><a href="' + esc(n.url) + '">' + esc(n.title) + '</a> <small>' + esc(new URL(n.url).hostname) + '</small></li>').join('');
  const toc = [
    ...p.sections.map(n => [anchor(n.id), n.title]),
    ...(examples ? [['examples', 'Examples']] : []),
    ...(events ? [['timeline', 'Timeline']] : []),
    ...(links ? [['practice', 'Code and practice']] : []),
    ...(relatedHtml || graphMap ? [['connections', 'Connections']] : []),
    ['references', 'References'],
    ['revisions', 'Revision history'],
  ];
  const badge = a.entityType ? ' <span class="badge">' + esc(humanEntity(a.entityType)) + '</span>' : '';
  const homepageLink = a.homepage ? '<p class="homepage-row"><a class="homepage-link" href="' + esc(a.homepage) + '">Visit ' + esc(new URL(a.homepage).hostname) + ' ↗</a></p>' : '';
  return '<div class="reading"><article><header class="article-title"><p class="kicker"><a href="' + collectionHref(a.category) + '">' + esc(a.category) + '</a>' + badge + '</p><h1>' + esc(a.title) + '</h1>' + (a.summary ? '<p class="lead">' + markup(a.summary) + refs(a) + '</p>' : '') + homepageLink + '<p class="edition">Article revision recorded <time>' + esc(a.recordedAt.slice(0, 10)) + '</time></p></header>' + sections + examples + events + links + graphMap + relatedHtml + backlinksHtml + '<section id="references"><h2>References</h2><ol class="sources">' + sources + '</ol></section><details id="revisions"><summary>Revision history</summary><ul>' + revisions + '</ul></details></article><aside class="contents"><p>On this page</p>' + toc.map(([id, label]) => '<a href="#' + id + '">' + esc(label) + '</a>').join('') + '</aside></div>';
}

export function cardHtml(i) {
  const badge = i.entityType ? '<em>' + esc(humanEntity(i.entityType)) + '</em>' : '';
  return '<a class="card" href="' + href(i.slug) + '" data-slug="' + esc(i.slug) + '" data-search="' + esc((i.title + ' ' + i.category + ' ' + (i.entityType || '') + ' ' + i.slug + ' ' + (i.aliases || []).join(' ')).toLowerCase()) + '"><strong>' + esc(i.title) + badge + '</strong><span>' + esc(i.description || '') + '</span></a>';
}

export function indexBody(items, graphMeta = null) {
  const categories = [...new Set(items.map(i => i.category))];
  const large = items.length > 48;
  const stats = graphMeta
    ? `<p class="wiki-stats">${items.length} articles · ${categories.length} collections · ${graphMeta.edges.length} graph links · <a href="/graph/">Open Graph Explorer</a></p>`
    : '';
  const collectionHubs = large
    ? '<section class="collection-hubs"><h2>Collections</h2><div class="collection-grid">' + categories.map(cat => {
        const count = items.filter(i => i.category === cat).length;
        return '<a class="collection-card" href="' + collectionHref(cat) + '"><strong>' + esc(cat) + '</strong><span>' + count + ' ' + (count === 1 ? 'article' : 'articles') + '</span></a>';
      }).join('') + '</div></section>'
    : '';
  const groupsHtml = categories.map(cat => {
    const inCat = items.filter(i => i.category === cat);
    const shown = large ? inCat.slice(0, 6) : inCat;
    const more = large && inCat.length > shown.length
      ? '<p class="cat-more"><a href="' + collectionHref(cat) + '">Browse all ' + inCat.length + ' articles in ' + esc(cat) + ' →</a></p>'
      : '';
    return '<section class="index-group"><h2><a href="' + collectionHref(cat) + '">' + esc(cat) + '</a></h2><div class="cards">' + shown.map(cardHtml).join('') + '</div>' + more + '</section>';
  }).join('');
  return '<div class="index"><header><p class="kicker">Subject index</p><h1>Explore the wiki</h1><p class="lead">Follow every public subject, site, app, and timeline through cited evidence, typed connections, and bitemporal history.</p>' + stats + '</header><label class="search">Find an article<input id="search" type="search" placeholder="Search ' + items.length + ' articles by title, topic, or site" autocomplete="off"></label><p role="status" id="results"></p><div id="search-hits" class="cards" hidden></div>' + collectionHubs + groupsHtml + '</div>';
}

export function collectionBody(category, items) {
  return '<div class="index"><header><p class="kicker"><a href="/">All collections</a></p><h1>' + esc(category) + '</h1><p class="lead">' + items.length + ' cited ' + (items.length === 1 ? 'article' : 'articles') + ' in ' + esc(category) + '.</p></header><label class="search">Filter ' + esc(category) + '<input id="search" type="search" data-scope="local" placeholder="Filter this collection" autocomplete="off"></label><p role="status" id="results"></p><section class="index-group"><div class="cards">' + items.map(cardHtml).join('') + '</div></section></div>';
}

export function graphBody(indexData) {
  const topHubs = [...indexData.nodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, 24);
  const catOptions = indexData.categories.map(c => `<option value="${esc(c.key)}">${esc(c.name)} (${c.count})</option>`).join('');
  const hubLinks = topHubs.map(n => `<a class="card" href="${href(n.slug)}"><strong>${esc(n.title)}<em>${n.degree} links</em></strong><span>${esc(n.category)}${n.summary ? ' — ' + esc(n.summary.slice(0, 110)) : ''}</span></a>`).join('');
  return `<div class="graph-page"><header><p class="kicker">Knowledge graph</p><h1>Graph Explorer</h1><p class="lead">${indexData.nodes.length} articles connected by ${indexData.edges.length} typed links across ${indexData.categories.length} collections. Pick a node to inspect its neighborhood or filter by collection.</p></header><form class="graph-controls" id="graph-controls"><label>Search graph<input id="graph-search" type="search" placeholder="Find a site, app, person, or topic" autocomplete="off"></label><label>Collection<select id="graph-cat"><option value="">All collections</option>${catOptions}</select></label></form><div class="graph-workspace"><div class="graph-canvas-wrap"><svg id="graph-stage" viewBox="0 0 760 460" role="img" aria-label="Interactive wiki graph"></svg></div><aside class="graph-inspector" id="graph-inspector"><h2>Most connected hubs</h2><p>Select any node in the graph to inspect its outgoing links, backlinks, and live article.</p></aside></div><section class="index-group"><h2>Top connected articles</h2><div class="cards">${hubLinks}</div></section></div>`;
}

export function timelineBody(events, titles, totalCount = events.length) {
  const note = totalCount > events.length
    ? `<p class="lead">Showing ${events.length} landmark milestones out of ${totalCount} documented events across the wiki. Full structured history is available in <a href="/api/timeline.json">/api/timeline.json</a>.</p>`
    : '<p class="lead">Shared dated milestones across the wiki.</p>';
  return '<header><p class="kicker">Across subjects</p><h1>Timeline</h1>' + note + '</header><ol class="events">' + events.map(n => '<li><time>' + esc(formatEventDate(n.date)) + '</time><div>' + esc(n.title) + '<div>' + n.articles.filter(id => titles.has(id)).map(id => '<a href="' + href(titles.get(id).slug) + '#timeline">' + esc(titles.get(id).title) + '</a>').join(' · ') + '</div></div></li>').join('') + '</ol>';
}

export function shell(site, items, content, slug = '', context = {}) {
  const groups = [...new Set(items.map(i => i.category))];
  const compact = items.length > 25;
  let nav;
  if (!compact) {
    nav = groups.map(cat => '<details ' + (items.some(i => i.slug === slug && i.category === cat) || !slug ? 'open' : '') + '><summary>' + esc(cat) + '</summary>' + items.filter(x => x.category === cat).map(i => '<a ' + (slug === i.slug ? 'aria-current="page" ' : '') + 'href="' + href(i.slug) + '">' + esc(i.title) + '</a>').join('') + '</details>').join('');
  } else {
    const activeCat = context.category || items.find(i => i.slug === slug)?.category || '';
    const collectionsList = '<details open><summary>Collections</summary>' + groups.map(cat => {
      const count = items.filter(i => i.category === cat).length;
      return '<a ' + (cat === activeCat && !slug ? 'aria-current="page" ' : '') + 'href="' + collectionHref(cat) + '">' + esc(cat) + ' <small>(' + count + ')</small></a>';
    }).join('') + '</details>';
    let nearby = '';
    if (slug && activeCat) {
      const siblings = items.filter(i => i.category === activeCat);
      const picked = [];
      const cur = siblings.find(i => i.slug === slug);
      if (cur) picked.push(cur);
      for (const n of context.neighbors || []) {
        if (picked.length >= 12) break;
        if (!picked.some(x => x.slug === n.slug)) picked.push(n);
      }
      for (const s of siblings) {
        if (picked.length >= 16) break;
        if (!picked.some(x => x.slug === s.slug)) picked.push(s);
      }
      nearby = '<details open><summary>' + esc(activeCat) + '</summary>' + picked.map(i => '<a ' + (slug === i.slug ? 'aria-current="page" ' : '') + 'href="' + href(i.slug) + '">' + esc(i.title) + '</a>').join('') + (siblings.length > picked.length ? '<a class="nav-more" href="' + collectionHref(activeCat) + '">All ' + siblings.length + ' in ' + esc(activeCat) + ' →</a>' : '') + '</details>';
    }
    nav = collectionsList + nearby;
  }
  const quickSearch = compact ? '<div class="nav-search"><input id="nav-search" type="search" placeholder="Quick jump…" aria-label="Quick jump to any article" autocomplete="off"><div id="nav-results" class="nav-results" hidden></div></div>' : '';
  const controls = slug ? '<details class="timebox" id="timebox"><summary>Time view <span id="date-label">Latest revision</span></summary><form id="time-form"><label>Facts valid on<input name="validAt" type="date"></label><label>Wiki knew by (UTC)<input name="knownAt" type="datetime-local" step="0.001"></label><label class="scrub">Explore milestones<input id="scrubber" type="range" min="0" max="0" value="0" disabled></label><button>Apply dates</button><button type="button" id="reset">Latest</button></form><p>Event dates describe the subject. The knowledge cutoff controls which editorial revisions you can see.</p></details>' : '';
  const exports = slug ? '<div class="exports"><a id="json" href="/api/articles/' + slug + '.json">JSON</a><a id="markdown" href="/api/articles/' + slug + '.md">Markdown</a></div>' : '<div class="exports"><a href="/api/graph-index.json">Graph JSON</a><a href="/feed.json">Change feed</a><a href="/llms.txt">For agents</a></div>';
  return '<a class="skip" href="#main">Skip to content</a><header class="mast"><a class="wordmark" href="/"><span class="glyph" aria-hidden="true">W</span>' + esc(site) + '</a><nav><a href="/">Index</a><a href="/graph/">Graph</a><a href="/timeline/">Timeline</a><a href="/llms.txt">For agents</a></nav></header><div class="frame"><aside class="library"><a class="indexlink" href="/">Article index</a>' + quickSearch + nav + '</aside><main id="main" data-slug="' + esc(slug) + '"><div class="bar"><a href="/">Wiki index</a>' + exports + '</div>' + controls + '<div id="projection">' + content + '</div></main></div><footer>' + esc(site) + ' · <a href="/graph/">Graph explorer</a> · <a href="/feed.json">Revision feed</a> · <a href="https://github.com/hopperlabs-ai-opensource/hopper-wiki-maker">Build your own wiki with Wiki Maker</a></footer>';
}
