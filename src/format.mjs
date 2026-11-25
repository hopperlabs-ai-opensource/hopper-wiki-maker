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
    ...(p.article.image ? [`![${p.article.image.alt}](${p.article.image.src})`, p.article.image.caption, p.article.image.changes, `[${p.article.image.credit}](${p.article.image.creditUrl}) · [${p.article.image.license}](${p.article.image.licenseUrl})`] : []),
    ...(p.article.facts || []).map(f => `- **${f.label}**: [${f.value}](${f.sourceUrl})`),
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
  const citations = new Map();
  const refs = n => (n.sources || []).map(id => {
    const i = p.sources.findIndex(s => s.id === id);
    if (i < 0) return '';
    const count = (citations.get(i) || 0) + 1;
    citations.set(i, count);
    return `<sup><a id="cite-${i}-${count}" href="#src-${i}" aria-label="Reference ${i + 1}">[${i + 1}]</a></sup>`;
  }).join('');
  const topics = [...p.related, ...p.backlinks].filter(n => n.title.length >= 3);
  const titles = new Map(topics.map(n => [n.title.toLowerCase(), n]));
  const alternatives = [...titles.keys()].sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = alternatives.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + alternatives.join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
  function prose(value) {
    const linked = new Set();
    return value.split(/(`[^`\n]+`)/g).map(part => {
      if (part.startsWith('`') || !pattern) return markup(part);
      let start = 0, html = '';
      for (const match of part.matchAll(pattern)) {
        const target = titles.get(match[0].toLowerCase());
        if (!target || linked.has(target.slug)) continue;
        html += esc(part.slice(start, match.index)) + `<a href="${href(target.slug)}">${esc(match[0])}</a>`;
        linked.add(target.slug);
        start = match.index + match[0].length;
      }
      return html + esc(part.slice(start));
    }).join('');
  }
  const lead = a.summary ? '<p class="lead">' + prose(a.summary) + refs(a) + '</p>' : '';
  const bodySections = p.sections.filter(n => n.text.trim() !== a.summary?.trim() || n.steps?.length);
  function diagram(n) {
    if (!n.steps?.length) return '';
    return '<div class="diagram" aria-label="' + esc(n.title) + ' walkthrough">' + n.steps.map((step, i) => '<details ' + (!i ? 'open' : '') + '><summary><span>' + String(i + 1).padStart(2, '0') + '</span>' + esc(step.label) + '</summary><p>' + esc(step.text) + '</p></details>').join('') + '</div>';
  }
  const sections = bodySections.map(n => '<section id="' + anchor(n.id) + '"><h2>' + esc(n.title) + '</h2><p>' + n.text.split(/\n\s*\n/).map(prose).join('</p><p>') + refs(n) + '</p>' + diagram(n) + '</section>').join('');
  const examples = p.examples.length ? '<section id="examples"><h2>Examples</h2>' + p.examples.map(n => '<details class="example" ' + (n.order === 0 ? 'open' : '') + '><summary>' + esc(n.title) + '</summary><p>' + n.text.split(/\n\s*\n/).map(prose).join('</p><p>') + refs(n) + '</p>' + (n.code ? '<pre><code>' + esc(n.code) + '</code></pre>' : '') + '</details>').join('') + '</section>' : '';
  const years = new Map();
  for (const event of p.events) {
    const year = eventYearLabel(event.date);
    years.set(year, (years.get(year) || 0) + 1);
  }
  const counts = [...years], maximum = Math.max(1, ...years.values());
  const distribution = counts.length > 1 && p.events.length >= 3 && counts.length <= 14
    ? '<figure class="milestones"><figcaption>Documented milestones by year</figcaption>' + counts.map(([year, count]) => '<div><span>' + esc(year) + '</span><meter min="0" max="' + maximum + '" value="' + count + '" aria-label="' + count + ' documented milestones in ' + esc(year) + '"></meter><b>' + count + '</b></div>').join('') + '</figure>' : '';
  const events = p.events.length ? '<section id="timeline"><h2>Timeline</h2>' + distribution + '<ol class="events">' + p.events.map(n => '<li><time>' + esc(formatEventDate(n.date)) + '</time><div>' + esc(n.title) + refs(n) + (n.detail ? '<p>' + esc(n.detail) + '</p>' : '') + (n.chronoscope ? ' <a class="chrono" href="' + esc(n.chronoscope) + '">Chronoscope</a>' : '') + '</div></li>').join('') + '</ol></section>' : '';
  const links = p.links.length ? '<section id="practice"><h2>External links</h2><ul>' + p.links.map(n => '<li><a href="' + esc(n.url) + '">' + esc(n.title) + '</a>' + refs(n) + '</li>').join('') + '</ul></section>' : '';

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
  const backlinksHtml = p.backlinks.length ? '<section id="backlinks"><h2>Linked from</h2><div class="relations">' + p.backlinks.slice(0, 36).map(n => '<a href="' + href(n.slug) + '">' + esc(n.title) + '</a>').join('') + (p.backlinks.length > 36 ? '<a class="more-link" href="/graph/#' + encodeURIComponent(p.slug) + '">+' + (p.backlinks.length - 36) + ' more in graph</a>' : '') + '</div></section>' : '';
  const graphMap = neighborhoodSvg(p);
  const mapPanel = graphMap ? '<details class="map-panel"><summary>View connections on the graph</summary>' + graphMap + '</details>' : '';

  const revisions = p.history.slice().reverse().map(r => '<li><a href="?knownAt=' + encodeURIComponent(r.recordedAt) + '">' + esc(r.recordedAt.slice(0, 10)) + '</a> ' + esc(r.message) + ' <code>' + esc(r.id.slice(0, 9)) + '</code> · <a href="/api/diffs/' + r.id + '.json">View changes</a></li>').join('');
  const sources = p.sources.map((n, i) => '<li id="src-' + i + '">' + (citations.has(i) ? '<a class="backref" aria-label="Back to citation ' + (i+1) + '" href="#cite-' + i + '-1">↑</a>' : '') + '<a href="' + esc(n.url) + '">' + esc(n.title) + '</a> <small>' + esc(new URL(n.url).hostname) + '</small></li>').join('');
  const toc = [
    ...bodySections.map(n => [anchor(n.id), n.title]),
    ...(examples ? [['examples', 'Examples']] : []),
    ...(events ? [['timeline', 'Timeline']] : []),
    ...(links ? [['practice', 'External links']] : []),
    ...(relatedHtml ? [['connections', 'Connections']] : []),
    ...(backlinksHtml ? [['backlinks', 'Linked from']] : []),
    ['references', 'References'],
    ['revisions', 'Revision history'],
  ];
  const tocLinks = [['article', 'Beginning'], ...toc].map(([id, label]) => `<a href="#${esc(id)}">${esc(label)}</a>`).join('');
  const image = a.image;
  const picture = image ? `<figure><a href="${esc(image.creditUrl)}"><img src="${esc(image.src)}" alt="${esc(image.alt)}" width="${image.width}" height="${image.height}"></a><figcaption>${esc(image.caption)}<br><small><a href="${esc(image.creditUrl)}">${esc(image.credit)}</a> · <a href="${esc(image.licenseUrl)}">${esc(image.license)}</a>${image.changes ? " · " + esc(image.changes) : ""}</small></figcaption></figure>` : '';
  const facts = (a.facts || []).map(f => `<div><dt>${esc(f.label)}</dt><dd><a href="${esc(f.sourceUrl)}">${esc(f.value)}</a></dd></div>`);
  if (a.entityType) facts.push(`<div><dt>Type</dt><dd>${esc(humanEntity(a.entityType))}</dd></div>`);
  if (a.homepage) facts.push(`<div><dt>Website</dt><dd><a href="${esc(a.homepage)}">${esc(new URL(a.homepage).hostname)}</a></dd></div>`);
  const info = (image || a.facts?.length || a.homepage) ? `<aside aria-label="Article facts" class="infobox${image ? '' : ' noimage'}"><div class="info-title">${esc(a.title)}</div>${picture}<dl class="facts">${facts.join('')}</dl></aside>` : '';
  const appearance = '<details class="appearance"><summary aria-label="Reading appearance"><b>Aa</b> Appearance</summary><div class="pop"><fieldset><legend>Text size</legend><label><input type="radio" name="text-size" value="standard" checked> Standard</label><label><input type="radio" name="text-size" value="large"> Large</label></fieldset><fieldset><legend>Reading width</legend><label><input type="radio" name="reading-width" value="standard" checked> Standard</label><label><input type="radio" name="reading-width" value="wide"> Wide</label></fieldset></div></details>';
  return `<div class="layout reading"><aside class="contents"><h2>Contents</h2><nav aria-label="Article contents">${tocLinks}</nav></aside><article class="work" id="article"><header><div class="contextline"><a href="/">Wiki</a><span>›</span><a href="${collectionHref(a.category)}">${esc(a.category)}</a></div><h1>${esc(a.title)}</h1><div class="tabrow"><nav class="tabs" aria-label="Article navigation"><a aria-current="page" href="#article">Article</a><a href="#references">References</a><a href="#timebox">History</a></nav>${appearance}</div></header><details class="mobiletoc"><summary>Contents</summary><nav aria-label="Article contents">${tocLinks}</nav></details><div class="entry">${info}${lead}${sections}${examples}${events}${links}${relatedHtml}${backlinksHtml}${mapPanel}<section class="refblock" id="references"><h2>References</h2><ol class="references">${sources}</ol></section><details id="revisions"><summary>Revision history</summary><ul>${revisions}</ul></details></div></article></div>`;

}

export function cardHtml(i) {
  const badge = i.entityType ? '<em>' + esc(humanEntity(i.entityType)) + '</em>' : '';
  return '<a class="card" href="' + href(i.slug) + '" data-slug="' + esc(i.slug) + '" data-search="' + esc((i.title + ' ' + i.category + ' ' + (i.entityType || '') + ' ' + i.slug + ' ' + (i.aliases || []).join(' ')).toLowerCase()) + '"><strong>' + esc(i.title) + badge + '</strong><span>' + esc(i.description || '') + '</span></a>';
}

export function indexBody(items, graphMeta, featuredSlugs = []) {
  const categories = [...new Set(items.map(i => i.category))].sort();
  const featured = featuredSlugs.map(slug => items.find(i => i.slug === slug)).filter(Boolean);
  const list = categories.map(cat => {
    const members = items.filter(i => i.category === cat);
    return `<dt><a href="${collectionHref(cat)}">${esc(cat)}</a> <small>${members.length}</small></dt><dd>${members.slice(0, 3).map(i => `<a href="${href(i.slug)}">${esc(i.title)}</a>`).join(' · ')}</dd>`;
  }).join('');
  return `<div class="index"><h1>Subject index</h1><p class="wiki-stats">${items.length} articles in ${categories.length} collections · <a href="/graph/">${graphMeta.edges.length} graph connections</a></p><div class="directory"><section><h2>Browse by subject</h2><dl>${list}</dl></section><section><h2>${featured.length ? 'Selected articles' : 'Articles'}</h2><dl>${(featured.length ? featured : items.slice(0, 6)).map(i => `<dt><a href="${href(i.slug)}">${esc(i.title)}</a></dt><dd>${esc(i.description || '')}</dd>`).join('')}</dl></section></div></div>`;
}

export function collectionBody(category, items) {
  const links = items.map(i => `<li class="card" data-search="${esc([i.title, i.slug, ...(i.aliases || [])].join(' ').toLowerCase())}"><a href="${href(i.slug)}">${esc(i.title)}</a></li>`).join('');
  return `<div class="index"><header><p class="kicker"><a href="/">Subject index</a></p><h1>${esc(category)}</h1><p>${items.length} ${items.length === 1 ? 'article' : 'articles'}</p></header><label class="search">Filter this collection<input id="search" type="search" autocomplete="off"></label><p role="status" id="results"></p><section class="index-group"><ul class="subject-list">${links}</ul></section></div>`;
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
  const brand = context.brand;
  const mark = brand ? `<b>${esc(brand.name)}</b><span>${esc(brand.section)}</span>` : `<b>${esc(site)}</b>`;
  const quickSearch = '<div class="find"><form class="searchform" role="search"><span class="glass" aria-hidden="true"></span><input id="nav-search" type="search" placeholder="Search the wiki" aria-label="Search the wiki" autocomplete="off" aria-controls="nav-results"><button type="submit">Search</button></form><div id="nav-results" class="found" hidden></div></div>';
  const controls = slug ? '<details class="timebox" id="timebox"><summary>Time view <span id="date-label">Latest revision</span></summary><form id="time-form"><label>Facts valid on<input name="validAt" type="date"></label><label>Wiki knew by (UTC)<input name="knownAt" type="datetime-local" step="0.001"></label><label class="scrub">Explore milestones<input id="scrubber" type="range" min="0" max="0" value="0" disabled></label><button>Apply dates</button><button type="button" id="reset">Latest</button></form><p>Event dates describe the subject. The knowledge cutoff controls which editorial revisions you can see.</p></details>' : '';
  const exports = slug ? '<div class="exports"><a id="json" href="/api/articles/' + slug + '.json">JSON</a><a id="markdown" href="/api/articles/' + slug + '.md">Markdown</a></div>' : '<div class="exports"><a href="/api/graph-index.json">Graph JSON</a><a href="/feed.json">Change feed</a></div>';
  return `<a class="skip" href="#main">Skip to content</a><header class="mast"><div class="wrap mastline"><a class="brand" href="/">${mark}</a>${quickSearch}<div class="tools">${brand ? '<span data-hopper-toolbar-slot=""></span>' : ''}</div></div></header><main id="main" class="wrap" data-slug="${esc(slug)}"><div id="projection">${content}</div>${controls}</main><footer class="foot wrap"><nav aria-label="Wiki resources"><a href="/">Index</a><a href="/graph/">Graph</a><a href="/timeline/">Timeline</a>${context.hasCoverage ? '<a href="/coverage/">Source coverage</a>' : ''}<a href="/llms.txt">For agents</a></nav>${exports}</footer>`;
}
