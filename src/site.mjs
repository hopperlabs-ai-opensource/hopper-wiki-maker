import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { find, project, validate, head, nodesAt, articleHistoryGraph, graphIndex, slugKey, compareEventDates } from './graph.mjs';
import { esc, href, collectionHref, indexBody, collectionBody, articleBody, graphBody, timelineBody, markdown, shell } from './format.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const save = (dir, file, body) => {
  const p = path.join(dir, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};

export function exportWiki(graph, dir, { origin = '', emitFullGraph = true, brand, featured = [], coverage = [] } = {}) {
  validate(graph);
  const releaseView = { validAt: (graph.revisions.at(-1)?.recordedAt || '1970-01-01').slice(0, 10) };
  const file = (name, body) => save(dir, name, body);
  const json = (name, obj) => file(name, JSON.stringify(obj) + '\n');

  const items = find(graph, '', releaseView);
  const gIndex = graphIndex(graph, releaseView);
  const pages = [];

  function page(route, title, description, body, slug = '', context = {}) {
    const inner = shell(graph.title, items, body, slug, { ...context, brand, hasCoverage: coverage.length > 0 });
    pages.push({ route, title, description, html: inner, ...context.metadata });
    file(route.slice(1) + 'index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + esc(title) + ' · ' + esc(graph.title) + '</title><meta name="description" content="' + esc(description) + '"><link rel="stylesheet" href="/assets/wiki.css"><script type="module" src="/assets/wiki.mjs"></script></head><body>' + inner + '</body></html>');
  }

  page('/', graph.title, 'Browse cited articles, products, collections, examples and dated events.', indexBody(items, gIndex, featured));
  page('/graph/', 'Graph Explorer', 'Interactive graph of all articles, collections, and typed connections.', graphBody(gIndex));

  if (coverage.length) {
    const slugs = new Set(items.map(i => i.slug));
    const rows = coverage.map(c => {
      if (!/^https:\/\//u.test(c.source) || !Number.isSafeInteger(c.denominator) || c.denominator < 0 || !Array.isArray(c.articles)) throw Error('Invalid coverage record');
      if (c.articles.some(slug => !slugs.has(slug)) || c.articles.length > c.denominator) throw Error('Unresolved coverage in ' + c.title);
      const links = c.articles.map(slug => ({ slug, href: href(slug) }));
      return { title: c.title, source: c.source, denominator: c.denominator, matched: links.length, note: c.note || '', articles: links };
    });
    const rowsHtml = rows.map(r => `<tr><th scope="row"><a href="${esc(r.source)}">${esc(r.title)}</a></th><td>${r.matched}</td><td>${r.denominator}</td><td>${esc(r.note)}</td></tr>`).join('');
    const description = 'Public catalog records matched to articles in this edition of the wiki.';
    page('/coverage/', 'Source coverage', description, `<div class="index"><p class="kicker"><a href="/">Subject index</a></p><h1>Source coverage</h1><p>${description} Checked <time>${releaseView.validAt}</time>. An article can appear in several catalogs.</p><table class="coverage"><thead><tr><th scope="col">Public catalog</th><th scope="col">Matched</th><th scope="col">Listed</th><th scope="col">Scope</th></tr></thead><tbody>${rowsHtml}</tbody></table><p><a href="/api/coverage.json">Download the catalog-to-article matches</a></p></div>`);
    json('api/coverage.json', { revision: head(graph), date: releaseView.validAt, surfaces: rows });
  }

  for (const i of items) {
    const p = project(graph, i.slug, releaseView);
    const neighbors = [...p.related, ...p.backlinks];
    page(href(i.slug), i.title, i.description || i.title, articleBody(p), i.slug, { category: i.category, neighbors, metadata: { aliases: p.article.aliases || [], published: p.history[0].recordedAt, modified: p.history.at(-1).recordedAt } });
    json('api/articles/' + i.slug + '.json', p);
    file('api/articles/' + i.slug + '.md', markdown(p));
    json('api/history/' + i.slug + '.json', articleHistoryGraph(graph, i.slug));
    for (const a of p.article.aliases || []) {
      file('wiki/' + a + '/index.html', '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + href(i.slug) + '"><a href="' + href(i.slug) + '">' + esc(i.title) + '</a>');
    }
  }

  const allEvents = [...nodesAt(graph, releaseView).values()]
    .filter(n => n.kind === 'event')
    .sort((a, b) => compareEventDates(b.date, a.date) || a.id.localeCompare(b.id));
  const titles = new Map(items.map(i => ['article:' + i.slug, i]));
  const shownEvents = allEvents.slice(0, 180);
  page('/timeline/', 'Timeline', 'Shared dated milestones across the wiki.', timelineBody(shownEvents, titles, allEvents.length));

  const categories = [...new Set(items.map(i => i.category))];
  for (const category of categories) {
    const listed = items.filter(i => i.category === category);
    const ids = new Set(listed.map(i => 'article:' + i.slug));
    const key = slugKey(category);
    page(collectionHref(category), category, `${listed.length} cited articles in ${category}.`, collectionBody(category, listed), '', { category });
    json('api/collections/' + key + '.json', {
      category,
      key,
      revision: head(graph),
      articles: listed,
      events: allEvents.filter(n => n.articles.some(id => ids.has(id))),
    });
  }

  json('api/index.json', {
    title: graph.title,
    revision: head(graph),
    articles: items,
    categories: gIndex.categories,
    search: '/api/search.json',
    graphIndex: '/api/graph-index.json',
    timeline: '/api/timeline.json',
    graph: '/api/graph.json',
    feed: '/feed.json',
  });
  json('api/search.json', items.map(i => ({
    s: i.slug,
    t: i.title,
    c: i.category,
    ...(i.entityType ? { k: i.entityType } : {}),
    ...(i.description ? { d: i.description.slice(0, 180) } : {}),
    ...(i.aliases?.length ? { a: i.aliases } : {}),
  })));
  json('api/graph-index.json', gIndex);
  if (emitFullGraph) json('api/graph.json', graph);
  json('api/timeline.json', allEvents);
  json('feed.json', {
    version: 'https://jsonfeed.org/version/1.1',
    title: graph.title + ' revisions',
    home_page_url: origin + '/',
    feed_url: origin + '/feed.json',
    items: [...graph.revisions].reverse().map(r => ({
      id: r.id,
      title: r.message,
      date_published: r.recordedAt,
      url: origin + '/api/revisions/' + r.id + '.json',
      content_text: r.changes.length + ' graph changes',
      _articles: [...new Set(r.changes.flatMap(c => [...(c.id.startsWith('article:') ? [c.id] : []), ...c.node?.articles || [], ...c.node?.article ? [c.node.article] : []]))],
    })),
  });

  const earlier = { ...graph, revisions: [] };
  for (const r of graph.revisions) {
    json('api/revisions/' + r.id + '.json', r);
    const prevNodes = nodesAt(earlier, { validAt: releaseView.validAt });
    json('api/diffs/' + r.id + '.json', r.changes.map(c => ({
      id: c.id,
      from: c.from,
      until: c.until ?? null,
      before: c.from === releaseView.validAt ? (prevNodes.get(c.id) ?? null) : (nodesAt(earlier, { validAt: c.from }).get(c.id) ?? null),
      after: c.node,
    })));
    earlier.revisions.push(r);
  }

  const llmsList = items.length <= 120
    ? items.map(i => `- [${i.title}](${origin}/api/articles/${i.slug}.md)`).join('\n')
    : [
        '## Collections',
        ...gIndex.categories.map(c => `- [${c.name} (${c.count})](${origin}/api/collections/${c.key}.json)`),
        '',
        '## Featured articles',
        ...items.slice(0, 60).map(i => `- [${i.title}](${origin}/api/articles/${i.slug}.md)`),
      ].join('\n');

  file('llms.txt', '# ' + graph.title + '\n\n- [Article index](' + origin + '/api/index.json)\n- [Compact search index](' + origin + '/api/search.json)\n- [Typed graph topology](' + origin + '/api/graph-index.json)\n- [Bitemporal graph](' + origin + '/api/graph.json)\n- [Event timeline](' + origin + '/api/timeline.json)\n- [Change feed](' + origin + '/feed.json)\n\nLocal agent access: run wiki-maker mcp ' + origin + '/api/graph.json from the open-source Wiki Maker. Compatible browsers expose wiki_search, wiki_read and wiki_changes through WebMCP.\n\n' + llmsList + '\n');

  for (const [source, name] of [['web/wiki.css', 'wiki.css'], ['web/wiki.mjs', 'wiki.mjs'], ['src/project.mjs', 'project.mjs'], ['src/format.mjs', 'format.mjs']]) {
    const bytes = fs.readFileSync(path.join(root, source), 'utf8');
    file('assets/' + name, name === 'wiki.mjs' ? bytes.replaceAll("from '../src/", "from './") : bytes);
  }
  return pages;
}
