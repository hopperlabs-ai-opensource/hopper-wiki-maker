// This module is shared by the CLI, static builder and browser. All times are UTC.
export const latest = '9999-12-31';
export const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const slugKey = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';

export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw Error('Expected ISO date');
  }
  return value;
}

export function eventDate(value) {
  if (typeof value !== 'string' || !/^-?\d{1,6}(?:-\d\d(?:-\d\d)?)?$/.test(value)) throw Error('Invalid event date');
  const neg = value.startsWith('-');
  const parts = (neg ? value.slice(1) : value).split('-');
  const year = Number(parts[0]);
  if (!Number.isFinite(year) || (neg && year === 0)) throw Error('Invalid event date');
  if (parts.length >= 2) {
    const month = Number(parts[1]);
    if (month < 1 || month > 12) throw Error('Invalid event date');
  }
  if (parts.length === 3) {
    const day = Number(parts[2]);
    if (day < 1 || day > 31) throw Error('Invalid event date');
    if (!neg && parts[0].length === 4) date(value);
  }
  return value;
}

export function eventSortKey(value) {
  const neg = value.startsWith('-');
  const parts = (neg ? value.slice(1) : value).split('-');
  const year = (neg ? -1 : 1) * Number(parts[0]);
  const month = parts[1] ? Number(parts[1]) : 0;
  const day = parts[2] ? Number(parts[2]) : 0;
  return [year, month, day];
}

export function compareEventDates(a, b) {
  const ka = eventSortKey(a), kb = eventSortKey(b);
  return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (ka[2] - kb[2]);
}

export function formatEventDate(value) {
  if (typeof value !== 'string' || !value.startsWith('-')) return value;
  const year = Number(value.slice(1).split('-')[0]);
  const formatted = year >= 10000 ? year.toLocaleString('en-US') : String(year);
  return formatted + ' BCE';
}

export function eventYearLabel(value) {
  if (typeof value !== 'string') return '';
  if (value.startsWith('-')) {
    const year = Number(value.slice(1).split('-')[0]);
    return (year >= 10000 ? year.toLocaleString('en-US') : String(year)) + ' BCE';
  }
  return value.split('-')[0];
}

export function knowledge(value) {
  if (value == null || value === '') return '9999-12-31T23:59:59.999Z';
  if (value.length === 10) return date(value) + 'T23:59:59.999Z';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw Error('Expected a UTC timestamp');
  }
  return value;
}

export function nodesAt(graph, { validAt = new Date().toISOString().slice(0, 10), knownAt } = {}) {
  date(validAt);
  const cutoff = knowledge(knownAt), nodes = new Map();
  for (const revision of graph.revisions) {
    if (revision.recordedAt > cutoff) break;
    for (const change of revision.changes) {
      if (change.from <= validAt && (!change.until || validAt < change.until)) {
        if (change.node === null) nodes.delete(change.id);
        else nodes.set(change.id, { ...change.node, id: change.id, from: change.from, revision: revision.id, recordedAt: revision.recordedAt });
      }
    }
  }
  return nodes;
}

export function articleRelationEdges(article) {
  const seen = new Map();
  for (const r of article.relations || []) {
    if (r?.to && !seen.has(r.to)) seen.set(r.to, r.rel || 'related');
  }
  for (const to of article.related || []) {
    if (to && !seen.has(to)) seen.set(to, 'related');
  }
  return [...seen.entries()].map(([to, rel]) => ({ to, rel }));
}

export function project(graph, slug, options = {}) {
  const nodes = nodesAt(graph, options);
  const articles = [...nodes.values()].filter(n => n.kind === 'article');
  const article = articles.find(a => a.id === 'article:' + slug || a.aliases?.includes(slug));
  if (!article) return null;
  const owned = [...nodes.values()].filter(n => n.article === article.id || n.articles?.includes(article.id));
  const orderByPosition = (a, b) => (a.order ?? 0) - (b.order ?? 0) || order(a.id, b.id);
  const sections = owned.filter(n => n.kind === 'section').sort(orderByPosition);
  const events = owned.filter(n => n.kind === 'event').sort((a, b) => compareEventDates(a.date, b.date) || order(a.id, b.id));
  const examples = owned.filter(n => n.kind === 'example').sort(orderByPosition);
  const links = owned.filter(n => n.kind === 'link').sort(orderByPosition);
  const relation = (n, rel = 'related') => ({
    slug: n.id.slice(8),
    title: n.title,
    category: n.category,
    ...(n.entityType ? { entityType: n.entityType } : {}),
    rel,
  });
  const related = articleRelationEdges(article)
    .map(({ to, rel }) => { const target = nodes.get(to); return target ? relation(target, rel) : null; })
    .filter(Boolean);
  const backlinks = [];
  for (const other of articles) {
    if (other.id === article.id) continue;
    const hit = articleRelationEdges(other).find(e => e.to === article.id);
    if (hit) backlinks.push(relation(other, hit.rel));
  }
  backlinks.sort((a, b) => order(a.title, b.title));
  const cited = new Set([article, ...sections, ...events, ...examples, ...links].flatMap(n => n.sources || []));
  const sources = [...cited].map(id => nodes.get(id)).filter(Boolean);
  const history = graph.revisions
    .filter(r => r.recordedAt <= knowledge(options.knownAt) && r.changes.some(c => c.id === article.id || c.node?.article === article.id || c.node?.articles?.includes(article.id)))
    .map(r => ({ id: r.id, recordedAt: r.recordedAt, message: r.message }));
  return { slug: article.id.slice(8), article, sections, events, examples, links, sources, related, backlinks, history };
}

export function find(graph, query = '', opts = {}) {
  const term = query.trim().toLowerCase();
  return [...nodesAt(graph, opts).values()]
    .filter(n => n.kind === 'article' && (!term || [n.title, n.category, n.entityType || '', n.summary || '', n.id.slice(8), ...(n.aliases || [])].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => order(a.title, b.title))
    .map(n => ({
      slug: n.id.slice(8),
      title: n.title,
      category: n.category,
      ...(n.entityType ? { entityType: n.entityType } : {}),
      ...(n.summary ? { description: n.summary } : {}),
      ...(n.homepage ? { homepage: n.homepage } : {}),
      ...(n.aliases?.length ? { aliases: n.aliases } : {}),
    }));
}

export function articleHistoryGraph(graph, slug) {
  const targetIds = new Set(['article:' + slug]);
  for (const r of graph.revisions) {
    for (const c of r.changes) {
      if (c.node?.kind === 'article' && (c.id === 'article:' + slug || c.node.aliases?.includes(slug))) {
        targetIds.add(c.id);
      }
    }
  }
  const ownedIds = new Set(targetIds);
  const neighborIds = new Set();
  const sourceIds = new Set();
  for (const r of graph.revisions) {
    for (const c of r.changes) {
      const n = c.node;
      if (!n) continue;
      if (targetIds.has(c.id)) {
        for (const s of n.sources || []) sourceIds.add(s);
        for (const e of articleRelationEdges(n)) neighborIds.add(e.to);
      } else if (targetIds.has(n.article) || (n.articles || []).some(id => targetIds.has(id))) {
        ownedIds.add(c.id);
        for (const s of n.sources || []) sourceIds.add(s);
      } else if (n.kind === 'article' && articleRelationEdges(n).some(e => targetIds.has(e.to))) {
        neighborIds.add(c.id);
      }
    }
  }
  const revisions = graph.revisions.map(r => {
    const changes = [];
    for (const c of r.changes) {
      if (ownedIds.has(c.id) || sourceIds.has(c.id)) {
        changes.push(c);
      } else if (neighborIds.has(c.id)) {
        if (c.node === null) {
          changes.push(c);
        } else {
          // Compact stub keeps related/backlink resolution intact without carrying neighbor prose.
          const edgeToTarget = articleRelationEdges(c.node).filter(e => targetIds.has(e.to));
          changes.push({
            id: c.id,
            from: c.from,
            ...(c.until ? { until: c.until } : {}),
            node: {
              kind: 'article',
              title: c.node.title,
              category: c.node.category,
              ...(c.node.entityType ? { entityType: c.node.entityType } : {}),
              ...(edgeToTarget.length ? { relations: edgeToTarget } : {}),
              sources: [],
            },
          });
        }
      }
    }
    return { id: r.id, parent: r.parent, recordedAt: r.recordedAt, message: r.message, changes };
  });
  return { schema: graph.schema, title: graph.title, revisions };
}

export function graphIndex(graph, options = {}) {
  const nodesMap = nodesAt(graph, options);
  const articles = [...nodesMap.values()].filter(n => n.kind === 'article').sort((a, b) => order(a.title, b.title));
  const idSet = new Set(articles.map(a => a.id));
  const edges = [];
  const degree = new Map();
  for (const a of articles) {
    for (const { to, rel } of articleRelationEdges(a)) {
      if (!idSet.has(to) || to === a.id) continue;
      const fromSlug = a.id.slice(8), toSlug = to.slice(8);
      edges.push({ from: fromSlug, to: toSlug, rel });
      degree.set(fromSlug, (degree.get(fromSlug) || 0) + 1);
      degree.set(toSlug, (degree.get(toSlug) || 0) + 1);
    }
  }
  const categories = [...new Set(articles.map(a => a.category))].sort(order).map(name => ({
    name,
    key: slugKey(name),
    count: articles.filter(a => a.category === name).length,
  }));
  const nodes = articles.map(a => {
    const slug = a.id.slice(8);
    return {
      slug,
      title: a.title,
      category: a.category,
      categoryKey: slugKey(a.category),
      ...(a.entityType ? { entityType: a.entityType } : {}),
      ...(a.summary ? { summary: a.summary } : {}),
      ...(a.homepage ? { homepage: a.homepage } : {}),
      degree: degree.get(slug) || 0,
    };
  });
  return {
    title: graph.title,
    revision: graph.revisions.at(-1)?.id ?? null,
    categories,
    nodes,
    edges,
  };
}
