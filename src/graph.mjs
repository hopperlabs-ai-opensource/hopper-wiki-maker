import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { project, find, nodesAt, date, eventDate, knowledge, latest, articleRelationEdges, articleHistoryGraph, graphIndex, slugKey, formatEventDate, compareEventDates } from './project.mjs';
export { project, find, nodesAt, date, eventDate, knowledge, articleRelationEdges, articleHistoryGraph, graphIndex, slugKey, formatEventDate, compareEventDates };

export function canonical(x) {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}

export const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
export const head = g => g.revisions.at(-1)?.id ?? null;

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const relName = /^[a-z][a-z0-9-]{0,39}$/;
const kinds = ['article', 'source', 'section', 'event', 'example', 'link'];
const text = (v, label) => { if (typeof v !== 'string' || !v.trim()) throw Error('Missing ' + label); };

export function safeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Expected a public HTTPS URL');
}

function validChange(c) {
  if (typeof c.id !== 'string' || !kinds.includes(c.id.split(':')[0]) || !slug.test(c.id.split(':').slice(1).join(':'))) {
    throw Error('Invalid graph ID ' + c.id);
  }
  date(c.from);
  if (c.until != null && date(c.until) <= c.from) throw Error('Empty valid interval');
  const n = c.node;
  if (n === null) return;
  if (!n || n.kind !== c.id.split(':')[0] || ['id', 'from', 'recordedAt', 'revision'].some(k => k in n)) {
    throw Error('Invalid node ' + c.id);
  }
  text(n.title, 'title');
  if (n.kind === 'source') { safeUrl(n.url); return; }
  if (n.kind === 'article') {
    text(n.category, 'category');
    if (n.entityType != null && (typeof n.entityType !== 'string' || !relName.test(n.entityType))) {
      throw Error('Invalid entityType in ' + c.id);
    }
    if (n.image != null) {
      const im = n.image;
      for (const field of ['src', 'alt', 'caption', 'credit', 'license']) text(im[field], 'image ' + field);
      if (!/^\/media\/wiki\/[a-z0-9][a-z0-9_-]*\.(?:webp|jpg|jpeg|png|avif)$/.test(im.src)) safeUrl(im.src);
      safeUrl(im.creditUrl);
      safeUrl(im.licenseUrl);
      if (![im.width, im.height].every(v => Number.isSafeInteger(v) && v > 0)) throw Error('Invalid image dimensions');
    }
    if (n.facts != null) {
      if (!Array.isArray(n.facts)) throw Error('Expected sourced fact rows');
      for (const f of n.facts) { text(f.label, 'fact label'); text(f.value, 'fact value'); safeUrl(f.sourceUrl); }
    }
    if (n.homepage != null) safeUrl(n.homepage);
    for (const a of n.aliases || []) if (!slug.test(a)) throw Error('Invalid alias');
    for (const r of n.relations || []) {
      if (!r || typeof r.to !== 'string' || !r.to.startsWith('article:') || !slug.test(r.to.slice(8)) || !relName.test(r.rel || '')) {
        throw Error('Invalid relation in ' + c.id);
      }
    }
  } else {
    if (n.kind === 'event') {
      if (!Array.isArray(n.articles) || !n.articles.length) throw Error('Event needs subject articles');
      eventDate(n.date);
      if (n.chronoscope) safeUrl(n.chronoscope);
      if (n.ownerRef) {
        const ref = n.ownerRef, exactId = /^[a-z0-9][a-z0-9._:/@-]{0,239}$/;
        const resourceId = ref.productId === 'hopper.domain-app.chronoscope' && ref.resourceType === 'chronoscope.pack-entry'
          ? /^[\p{L}0-9][\p{L}\p{M}0-9._:/@-]{0,239}$/u : exactId;
        if (ref.schemaVersion !== 'hopper.exact-resource-ref.v1' || !resourceId.test(ref.resourceId || '') || !['productId', 'resourceType', 'version'].every(k => exactId.test(ref[k] || '')) || !/^sha256:[0-9a-f]{64}$/.test(ref.digest)) {
          throw Error('Invalid exact owner reference');
        }
      }
    } else {
      text(n.article, 'article reference');
      if (n.kind === 'link') safeUrl(n.url);
    }
    if (n.kind === 'section' || n.kind === 'example') text(n.text, 'text');
    if (!Array.isArray(n.sources) || !n.sources.length) throw Error('Evidence required for ' + c.id);
  }
}

function nodeAtFromHistory(entries, t) {
  if (!entries) return null;
  let active = null;
  for (const c of entries) {
    if (c.from <= t && (!c.until || t < c.until)) active = c.node;
  }
  return active;
}

function boundaryDatesFor(entries) {
  const out = [];
  if (!entries) return out;
  for (const c of entries) {
    out.push(c.from);
    if (c.until) out.push(c.until);
  }
  return out;
}

function referencedTargets(node) {
  if (!node || node.kind === 'source') return [];
  const targets = [];
  for (const id of node.sources || []) targets.push([id, 'source']);
  for (const id of node.articles || []) targets.push([id, 'article']);
  if (node.article) targets.push([node.article, 'article']);
  return targets;
}

function checkNodeIntegrity(id, historyById, checkDates) {
  const entries = historyById.get(id);
  if (!entries) return;
  for (const t of checkDates) {
    const n = nodeAtFromHistory(entries, t);
    if (!n) continue;
    for (const [targetId, expectedKind] of referencedTargets(n)) {
      const target = nodeAtFromHistory(historyById.get(targetId), t);
      if (target?.kind !== expectedKind) throw Error('Unresolved ' + expectedKind + ' ' + targetId + ' in ' + id);
    }
  }
}

function checkAliasesAt(articleIds, historyById, t) {
  const seen = new Set();
  for (const id of articleIds) {
    const n = nodeAtFromHistory(historyById.get(id), t);
    if (n?.kind === 'article') seen.add(id.slice(8));
  }
  for (const id of articleIds) {
    const n = nodeAtFromHistory(historyById.get(id), t);
    if (n?.kind !== 'article') continue;
    for (const a of n.aliases || []) {
      if (seen.has(a)) throw Error('Ambiguous alias ' + a);
      seen.add(a);
    }
  }
}

export function validate(g) {
  if (g.schema !== 'hopper.wiki-graph.v1' || !Array.isArray(g.revisions)) throw Error('Invalid wiki graph');
  text(g.title, 'wiki title');
  let parent = null, recorded = '';
  const allArticles = new Set();
  for (const r of g.revisions) {
    const { id, ...body } = r;
    if (id !== digest(body) || r.parent !== parent || knowledge(r.recordedAt) !== r.recordedAt || r.recordedAt <= recorded) {
      throw Error('Invalid revision chain or recorded time');
    }
    text(r.message, 'revision description');
    if (!Array.isArray(r.changes) || !r.changes.length) throw Error('Empty revision');
    const keys = new Set();
    for (const c of r.changes) {
      validChange(c);
      const k = c.id + '@' + c.from;
      if (keys.has(k)) throw Error('Duplicate change ' + k);
      keys.add(k);
      if (c.node?.kind === 'article') allArticles.add(c.id);
    }
    parent = id;
    recorded = r.recordedAt;
  }

  // Exact incremental interval-boundary validation across every revision.
  const historyById = new Map();
  const referrers = new Map();
  const seenArticles = new Set();

  for (const r of g.revisions) {
    const touchedIds = new Set();
    const aliasCheckDates = new Set();
    for (const c of r.changes) {
      let list = historyById.get(c.id);
      if (!list) { list = []; historyById.set(c.id, list); }
      list.push(c);
      touchedIds.add(c.id);
      if (c.node?.kind === 'article') {
        seenArticles.add(c.id);
        for (const rel of articleRelationEdges(c.node)) {
          if (!allArticles.has(rel.to)) throw Error('Unresolved related article ' + rel.to);
        }
        if (c.node.aliases?.length) {
          aliasCheckDates.add(c.from);
          if (c.until) aliasCheckDates.add(c.until);
          aliasCheckDates.add(latest);
        }
      } else if (c.id.startsWith('article:')) {
        aliasCheckDates.add(c.from);
        if (c.until) aliasCheckDates.add(c.until);
        aliasCheckDates.add(latest);
      }
      for (const [targetId] of referencedTargets(c.node)) {
        let revSet = referrers.get(targetId);
        if (!revSet) { revSet = new Set(); referrers.set(targetId, revSet); }
        revSet.add(c.id);
      }
    }

    const toVerify = new Set(touchedIds);
    for (const id of touchedIds) {
      for (const refId of referrers.get(id) || []) toVerify.add(refId);
    }

    for (const id of toVerify) {
      const entries = historyById.get(id);
      if (!entries) continue;
      const dates = new Set(boundaryDatesFor(entries));
      dates.add(latest);
      for (const c of entries) {
        for (const [targetId] of referencedTargets(c.node)) {
          for (const bt of boundaryDatesFor(historyById.get(targetId))) {
            if (bt >= c.from && (!c.until || bt < c.until)) dates.add(bt);
          }
        }
      }
      checkNodeIntegrity(id, historyById, dates);
    }

    for (const t of aliasCheckDates) checkAliasesAt(seenArticles, historyById, t);
  }
  return g;
}

export function initialize(title) { text(title, 'wiki title'); return { schema: 'hopper.wiki-graph.v1', title, revisions: [] }; }

export function candidate(graph, proposal, recordedAt = new Date().toISOString()) {
  if (!Object.hasOwn(proposal, 'base') || proposal.base !== head(graph)) {
    throw Error('Base revision changed. Read the current head and review the diff.');
  }
  // Revisions are persisted as JSON. Hash the same representation that readers receive.
  const changes = JSON.parse(JSON.stringify(proposal.changes));
  const body = { parent: proposal.base, recordedAt, message: proposal.message, changes };
  const revision = { id: digest(body), ...body };
  validate({ ...graph, revisions: [...graph.revisions, revision] });
  return revision;
}

export function diff(graph, proposal) {
  candidate(graph, proposal);
  return proposal.changes.map(c => ({ id: c.id, from: c.from, until: c.until ?? null, before: nodesAt(graph, { validAt: c.from }).get(c.id) ?? null, after: c.node }));
}

export function load(file) { return validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }

export function publish(file, proposal) {
  const lock = file + '.lock', fd = fs.openSync(lock, 'wx'), tmp = file + '.' + randomUUID() + '.tmp';
  try {
    const g = load(file), r = candidate(g, proposal);
    g.revisions.push(r);
    fs.writeFileSync(tmp, JSON.stringify(g, null, 2) + '\n', { flag: 'wx', flush: true });
    fs.renameSync(tmp, file);
    return r.id;
  } finally {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    fs.unlinkSync(lock);
  }
}

export function create(file, title) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(initialize(title), null, 2) + '\n', { flag: 'wx' });
}
