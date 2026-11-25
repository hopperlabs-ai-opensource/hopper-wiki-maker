import { project, find } from '../src/project.mjs';
import { esc, href, articleBody, markdown, cardHtml } from '../src/format.mjs';

let searchCache;
const loadSearch = () => searchCache ??= fetch('/api/search.json')
  .then(r => { if (!r.ok) throw Error('Search index unavailable'); return r.json(); })
  .catch(e => { searchCache = null; throw e; });

const historyCache = new Map();
const loadHistory = (articleSlug) => {
  if (!historyCache.has(articleSlug)) {
    const p = fetch('/api/history/' + encodeURIComponent(articleSlug) + '.json')
      .then(async r => {
        if (r.ok) return r.json();
        // Resolve aliases or fallback to full graph if needed
        const list = await loadSearch().catch(() => []);
        const hit = list.find(x => x.s === articleSlug || (x.a || []).includes(articleSlug));
        if (hit && hit.s !== articleSlug) {
          const r2 = await fetch('/api/history/' + encodeURIComponent(hit.s) + '.json');
          if (r2.ok) return r2.json();
        }
        const r3 = await fetch('/api/graph.json');
        if (!r3.ok) throw Error('Graph unavailable');
        return r3.json();
      })
      .catch(e => { historyCache.delete(articleSlug); throw e; });
    historyCache.set(articleSlug, p);
  }
  return historyCache.get(articleSlug);
};

// Main index & collection search
const query = document.querySelector('#search');
const searchHits = document.querySelector('#search-hits');
const resultsEl = document.querySelector('#results');
if (query) {
  const localOnly = query.dataset.scope === 'local';
  const collectionHubs = document.querySelector('.collection-hubs');
  let searchSeq = 0;
  const runSearch = async () => {
    const seq = ++searchSeq;
    const term = query.value.trim().toLowerCase();
    const groups = [...document.querySelectorAll('.index-group')];
    if (!term) {
      if (searchHits) { searchHits.hidden = true; searchHits.innerHTML = ''; }
      if (collectionHubs) collectionHubs.hidden = false;
      for (const g of groups) {
        g.hidden = false;
        for (const c of g.querySelectorAll('.card')) c.hidden = false;
      }
      if (resultsEl) resultsEl.textContent = '';
      return;
    }
    if (localOnly || !searchHits) {
      let count = 0;
      for (const card of document.querySelectorAll('.card')) {
        card.hidden = !(card.dataset.search || '').includes(term);
        if (!card.hidden) count++;
      }
      for (const g of groups) g.hidden = ![...g.querySelectorAll('.card')].some(c => !c.hidden);
      if (resultsEl) resultsEl.textContent = count + ' matching ' + (count === 1 ? 'article' : 'articles');
      return;
    }
    // Instant DOM filter first, then expand with full /api/search.json results
    let localCount = 0;
    for (const card of document.querySelectorAll('.index-group .card')) {
      const match = (card.dataset.search || '').includes(term);
      card.hidden = !match;
      if (match) localCount++;
    }
    for (const g of groups) g.hidden = ![...g.querySelectorAll('.card')].some(c => !c.hidden);
    if (collectionHubs) collectionHubs.hidden = true;
    if (resultsEl) resultsEl.textContent = localCount + ' matching ' + (localCount === 1 ? 'article' : 'articles');

    try {
      const all = await loadSearch();
      if (seq !== searchSeq) return;
      const matches = all.filter(i => (i.t + ' ' + i.c + ' ' + (i.k || '') + ' ' + i.s + ' ' + (i.d || '') + ' ' + (i.a || []).join(' ')).toLowerCase().includes(term));
      for (const g of groups) g.hidden = true;
      searchHits.innerHTML = matches.slice(0, 60).map(i => cardHtml({ slug: i.s, title: i.t, category: i.c, entityType: i.k, description: i.d || '', aliases: i.a || [] })).join('');
      searchHits.hidden = false;
      if (resultsEl) resultsEl.textContent = matches.length + ' matching ' + (matches.length === 1 ? 'article' : 'articles') + (matches.length > 60 ? ' (showing first 60)' : '');
    } catch { /* keep local DOM filter results */ }
  };
  query.addEventListener('input', () => { runSearch(); });
}

// Sidebar quick-jump search across every page
const navSearch = document.querySelector('#nav-search');
const navResults = document.querySelector('#nav-results');
if (navSearch && navResults) {
  let navSeq = 0;
  navSearch.addEventListener('focus', () => { loadSearch().catch(() => {}); });
  navSearch.addEventListener('input', async () => {
    const seq = ++navSeq;
    const term = navSearch.value.trim().toLowerCase();
    if (!term) { navResults.hidden = true; navResults.innerHTML = ''; return; }
    try {
      const all = await loadSearch();
      if (seq !== navSeq) return;
      const hits = all.filter(i => (i.t + ' ' + i.c + ' ' + i.s + ' ' + (i.a || []).join(' ')).toLowerCase().includes(term)).slice(0, 12);
      navResults.innerHTML = hits.length
        ? hits.map(i => `<a href="${href(i.s)}"><strong>${esc(i.t)}</strong><small>${esc(i.c)}</small></a>`).join('')
        : '<p class="nav-empty">No matching articles</p>';
      navResults.hidden = false;
    } catch { navResults.hidden = true; }
  });
}

// Per-article bitemporal Time View (uses compact /api/history/<slug>.json shard)
const slug = document.querySelector('#main')?.dataset.slug;
const form = document.querySelector('#time-form'), box = document.querySelector('#timebox'), slider = document.querySelector('#scrubber');
const urls = [];
function blobLink(id, data, type) {
  const u = URL.createObjectURL(new Blob([data], { type }));
  urls.push(u);
  const a = document.getElementById(id);
  if (a) { a.href = u; a.download = slug + (id === 'json' ? '.json' : '.md'); }
}

async function refresh() {
  const params = new URLSearchParams(location.search), validAt = params.get('validAt'), knownAt = params.get('knownAt');
  const g = await loadHistory(slug);
  const p = project(g, slug, { ...(validAt ? { validAt } : {}), ...(knownAt ? { knownAt } : {}) });
  const dates = [...new Set((project(g, slug, { knownAt: knownAt || undefined })?.events || [])
    .map(e => e.date)
    .filter(d => /^\d{4}(?:-\d\d(?:-\d\d)?)?$/.test(d))
    .map(d => d.length === 4 ? d + '-12-31' : d.length === 7 ? new Date(Date.UTC(+d.slice(0, 4), +d.slice(5), 0)).toISOString().slice(0, 10) : d))].sort();
  const last = g.revisions.at(-1)?.recordedAt.slice(0, 10);
  if (last && !dates.includes(last)) dates.push(last);
  dates.sort();
  form.validAt.value = validAt || '';
  form.knownAt.value = knownAt ? (knownAt.length === 10 ? knownAt + 'T23:59:59.999' : knownAt.replace(/Z$/, '')) : '';
  slider.max = String(Math.max(0, dates.length - 1));
  slider.disabled = dates.length < 2;
  slider.value = String(validAt ? Math.max(0, dates.findLastIndex(d => d <= validAt)) : dates.length - 1);
  slider.oninput = () => { form.validAt.value = dates[+slider.value]; navigate(false); };
  document.querySelector('#date-label').textContent = [validAt ? 'Valid on ' + validAt : 'Latest facts', knownAt ? 'known by ' + knownAt : ''].filter(Boolean).join(' · ');
  document.querySelector('#projection').innerHTML = p ? articleBody(p) : '<div class="sparse"><h1>No article at these dates</h1><p>Choose a later event date or knowledge cutoff to see the available record.</p></div>';
  for (const u of urls.splice(0)) URL.revokeObjectURL(u);
  for (const id of ['json', 'markdown']) { const el = document.getElementById(id); if (el) el.hidden = !p; }
  if (p) { blobLink('json', JSON.stringify(p, null, 2), 'application/json'); blobLink('markdown', markdown(p), 'text/markdown'); }
  for (const link of document.querySelectorAll('#projection a[href^="/wiki/"],.library a[href^="/wiki/"]')) {
    const url = new URL(link.href);
    url.search = params.toString();
    link.href = url.href;
  }
}

function showError(e) {
  document.querySelector('#date-label').textContent = 'Unable to load this time view';
  document.querySelector('#projection').innerHTML = '<p role="alert">' + esc(e.message) + '</p>';
}

function navigate(push = true) {
  const u = new URL(location.href);
  u.search = '';
  if (form.validAt.value) u.searchParams.set('validAt', form.validAt.value);
  if (form.knownAt.value) u.searchParams.set('knownAt', new Date(form.knownAt.value + 'Z').toISOString());
  history[push ? 'pushState' : 'replaceState']({}, '', u);
  refresh().catch(showError);
}

if (form && slug) {
  form.onsubmit = e => { e.preventDefault(); navigate(); };
  document.querySelector('#reset').onclick = () => { form.validAt.value = ''; form.knownAt.value = ''; navigate(); };
  box.ontoggle = () => { if (box.open) refresh().catch(showError); };
  if (location.search) { box.open = true; refresh().catch(showError); }
  addEventListener('popstate', () => refresh().catch(showError));
}

// Interactive Graph Explorer (/graph/)
const graphStage = document.querySelector('#graph-stage');
const graphInspector = document.querySelector('#graph-inspector');
const graphSearch = document.querySelector('#graph-search');
const graphCat = document.querySelector('#graph-cat');
if (graphStage && graphInspector) {
  fetch('/api/graph-index.json').then(r => r.json()).then(data => {
    const bySlug = new Map(data.nodes.map(n => [n.slug, n]));
    const adj = new Map();
    for (const e of data.edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      if (!adj.has(e.to)) adj.set(e.to, []);
      adj.get(e.from).push({ slug: e.to, rel: e.rel, dir: 'out' });
      adj.get(e.to).push({ slug: e.from, rel: e.rel, dir: 'in' });
    }
    const defaultFocus = () => {
      const hashSlug = decodeURIComponent(location.hash.slice(1));
      if (hashSlug && bySlug.has(hashSlug)) return hashSlug;
      return [...data.nodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))[0]?.slug || '';
    };
    let focused = defaultFocus();

    const renderFocus = (focusSlug) => {
      const catFilter = graphCat?.value || '';
      const q = (graphSearch?.value || '').trim().toLowerCase();
      let pool = data.nodes.filter(n => (!catFilter || n.categoryKey === catFilter) && (!q || (n.title + ' ' + n.category + ' ' + n.slug).toLowerCase().includes(q)));
      if (!pool.length) pool = data.nodes;
      const center = (focusSlug && pool.some(n => n.slug === focusSlug)) ? bySlug.get(focusSlug) : [...pool].sort((a, b) => b.degree - a.degree)[0];
      if (!center) return;
      focused = center.slug;
      const rawNeighbors = (adj.get(center.slug) || []).filter(e => bySlug.has(e.slug));
      const uniqueNeighbors = [];
      const seen = new Set([center.slug]);
      for (const e of rawNeighbors) {
        if (seen.has(e.slug)) continue;
        seen.add(e.slug);
        uniqueNeighbors.push({ ...bySlug.get(e.slug), rel: e.rel, dir: e.dir });
      }
      // If focused node has few edges, also show top peers in the filtered pool
      const shown = uniqueNeighbors.slice(0, 18);
      if (shown.length < 8) {
        for (const n of [...pool].sort((a, b) => b.degree - a.degree)) {
          if (seen.has(n.slug) || shown.length >= 14) continue;
          seen.add(n.slug);
          shown.push({ ...n, rel: 'peer', dir: 'peer' });
        }
      }
      const W = 760, H = 460, cx = W / 2, cy = H / 2;
      const inner = shown.slice(0, 8), outer = shown.slice(8);
      const svgParts = [];
      const placeRing = (list, rx, ry) => list.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / list.length - Math.PI / 2;
        const x = Math.round(cx + rx * Math.cos(angle));
        const y = Math.round(cy + ry * Math.sin(angle));
        if (n.dir !== 'peer') svgParts.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="gm-edge gm-${n.dir}"/>`);
        const label = n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title;
        const anchor = x < cx - 40 ? 'end' : x > cx + 40 ? 'start' : 'middle';
        const tx = x < cx - 40 ? x - 10 : x > cx + 40 ? x + 10 : x;
        const ty = x < cx - 40 || x > cx + 40 ? y + 4 : (y < cy ? y - 12 : y + 18);
        svgParts.push(`<g class="gm-node gm-pick" data-focus="${esc(n.slug)}" tabindex="0" role="button" aria-label="Inspect ${esc(n.title)}"><circle cx="${x}" cy="${y}" r="${n.dir === 'peer' ? 5 : 7}" class="gm-dot gm-${n.dir}"/><text x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(label)}</text></g>`);
      });
      placeRing(inner, 175, 130);
      if (outer.length) placeRing(outer, 290, 195);
      const cLabel = center.title.length > 24 ? center.title.slice(0, 22) + '…' : center.title;
      svgParts.push(`<g class="gm-center"><circle cx="${cx}" cy="${cy}" r="11"/><text x="${cx}" y="${cy + 26}" text-anchor="middle">${esc(cLabel)}</text></g>`);
      graphStage.innerHTML = svgParts.join('');

      const outLinks = uniqueNeighbors.filter(n => n.dir === 'out');
      const inLinks = uniqueNeighbors.filter(n => n.dir === 'in');
      graphInspector.innerHTML = `
        <p class="kicker">${esc(center.category)}</p>
        <h2><a href="${href(center.slug)}">${esc(center.title)}</a></h2>
        <p>${esc(center.summary || '')}</p>
        <p class="gi-actions"><a class="gi-btn" href="${href(center.slug)}">Read full article →</a>${center.homepage ? ` <a href="${esc(center.homepage)}">Visit live ↗</a>` : ''}</p>
        ${outLinks.length ? `<h3>Links to (${outLinks.length})</h3><div class="relations">${outLinks.slice(0, 20).map(n => `<button type="button" class="gi-chip" data-focus="${esc(n.slug)}">${esc(n.title)} <small>${esc(n.rel)}</small></button>`).join('')}</div>` : ''}
        ${inLinks.length ? `<h3>Linked from (${inLinks.length})</h3><div class="relations">${inLinks.slice(0, 20).map(n => `<button type="button" class="gi-chip" data-focus="${esc(n.slug)}">${esc(n.title)}</button>`).join('')}</div>` : ''}
      `;
    };

    const pickHandler = (e) => {
      const target = e.target.closest('[data-focus]');
      if (!target) return;
      const next = target.getAttribute('data-focus');
      if (next && bySlug.has(next)) {
        history.replaceState({}, '', '#' + encodeURIComponent(next));
        renderFocus(next);
      }
    };
    graphStage.addEventListener('click', pickHandler);
    graphStage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickHandler(e); } });
    graphInspector.addEventListener('click', pickHandler);
    graphCat?.addEventListener('change', () => renderFocus(''));
    graphSearch?.addEventListener('input', () => renderFocus(''));
    addEventListener('hashchange', () => renderFocus(defaultFocus()));
    renderFocus(focused);
  }).catch(e => { graphInspector.innerHTML = '<p role="alert">' + esc(e.message) + '</p>'; });
}

// WebMCP browser tools (using sharded search, history, and feed endpoints)
if (navigator.modelContext?.registerTool) {
  const tools = [
    {
      name: 'wiki_search',
      description: 'Search wiki articles by title, category, entity type, or topic.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      execute: async a => {
        const q = (a?.query || '').trim().toLowerCase();
        const list = await loadSearch();
        return list
          .filter(i => !q || (i.t + ' ' + i.c + ' ' + (i.k || '') + ' ' + i.s + ' ' + (i.d || '') + ' ' + (i.a || []).join(' ')).toLowerCase().includes(q))
          .map(i => ({ slug: i.s, title: i.t, category: i.c, ...(i.k ? { entityType: i.k } : {}), ...(i.d ? { description: i.d } : {}) }));
      },
    },
    {
      name: 'wiki_read',
      description: 'Read a cited article with optional valid date and knowledge cutoff.',
      inputSchema: { type: 'object', properties: { slug: { type: 'string' }, validAt: { type: 'string' }, knownAt: { type: 'string' } }, required: ['slug'] },
      execute: async a => {
        if (!a.validAt && !a.knownAt) {
          const r = await fetch('/api/articles/' + encodeURIComponent(a.slug) + '.json');
          if (r.ok) return r.json();
        }
        const g = await loadHistory(a.slug);
        return project(g, a.slug, a);
      },
    },
    {
      name: 'wiki_changes',
      description: 'Find published graph revisions after a UTC timestamp.',
      inputSchema: { type: 'object', properties: { since: { type: 'string' } } },
      execute: async a => {
        const r = await fetch('/feed.json');
        if (!r.ok) throw Error('Feed unavailable');
        const feed = await r.json();
        return (feed.items || [])
          .filter(item => !a?.since || item.date_published > a.since)
          .map(item => ({ id: item.id, recordedAt: item.date_published, message: item.title }));
      },
    },
  ];
  for (const tool of tools) {
    const run = tool.execute;
    try {
      navigator.modelContext.registerTool({
        ...tool,
        execute: async args => ({ content: [{ type: 'text', text: JSON.stringify(await run(args)) }] }),
      });
    } catch (error) {
      console.warn('Wiki browser tool registration failed', tool.name, error.message);
    }
  }
}
