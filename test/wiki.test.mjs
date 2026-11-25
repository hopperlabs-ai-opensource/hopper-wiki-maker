import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initialize, candidate, project, validate, publish, create, load, articleHistoryGraph, graphIndex, formatEventDate } from '../src/graph.mjs';
import { exportWiki } from '../src/site.mjs';
import { operate } from '../src/operations.mjs';

const changes = [
  { id: 'source:catalog', from: '1980-01-01', node: { kind: 'source', title: 'NASA Voyager mission', url: 'https://science.nasa.gov/mission/voyager/' } },
  { id: 'article:voyager', from: '1980-01-01', node: { kind: 'article', title: 'Voyager', category: 'Spaceflight', entityType: 'topic', related: [], sources: ['source:catalog'] } },
  { id: 'event:encounter', from: '1980-11-12', node: { kind: 'event', articles: ['article:voyager'], title: 'Voyager 1 encounters Saturn', date: '1980-11-12', sources: ['source:catalog'] } },
];

test('late correction preserves valid and recorded history, including interval ends', () => {
  const g = initialize('Space wiki'), r = candidate(g, { base: null, message: 'Archive', changes }, '2026-01-01T10:00:00.000Z');
  g.revisions.push(r);
  const fix = { ...changes[2], until: '1980-12-01', node: { ...changes[2].node, title: 'Voyager 1 flies past Saturn' } };
  g.revisions.push(candidate(g, { base: r.id, message: 'Clarify encounter', changes: [fix] }, '2026-01-02T10:00:00.000Z'));

  assert.equal(project(g, 'voyager', { validAt: '1980-11-01' }).events.length, 0);
  assert.equal(project(g, 'voyager', { validAt: '1980-11-12', knownAt: '2026-01-01' }).events[0].title, changes[2].node.title);
  assert.equal(project(g, 'voyager', { validAt: '1980-11-12' }).events[0].title, fix.node.title);
  assert.equal(project(g, 'voyager', { validAt: '1980-12-01' }).events[0].title, changes[2].node.title);
  assert.equal(project(g, 'voyager', { knownAt: '2025-12-31' }), null);

  // Per-article history shard produces identical bitemporal projections
  const shard = articleHistoryGraph(g, 'voyager');
  assert.equal(project(shard, 'voyager', { validAt: '1980-11-12', knownAt: '2026-01-01' }).events[0].title, changes[2].node.title);
  assert.equal(project(shard, 'voyager', { validAt: '1980-11-12' }).events[0].title, fix.node.title);
  assert.equal(project(shard, 'voyager', { validAt: '1980-12-01' }).events[0].title, changes[2].node.title);

  assert.throws(() => candidate(g, { base: null, message: 'stale', changes }));
  g.revisions[0].message = 'edited';
  assert.throws(() => validate(g));
});

test('fresh graph exports another topic with working citations, timeline, shards and agent records', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-release-'));
  try {
    const file = path.join(dir, 'wiki.json');
    create(file, 'Spaceflight');
    const proposal = { base: null, message: 'Add encounter', changes };
    assert.throws(() => publish(file, { ...proposal, changes: changes.slice(1) }));
    publish(file, proposal);
    assert.throws(() => publish(file, proposal));
    const out = path.join(dir, 'dist');
    exportWiki(load(file), out, { origin: 'https://example.org' });
    assert.match(readFileSync(path.join(out, 'timeline/index.html'), 'utf8'), /Voyager 1 encounters Saturn/);
    assert.match(readFileSync(path.join(out, 'api/articles/voyager.md'), 'utf8'), /science\.nasa\.gov/);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'api/timeline.json'))).length, 1);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'api/search.json'))).length, 1);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'api/graph-index.json'))).nodes.length, 1);
    assert.ok(existsSync(path.join(out, 'api/history/voyager.json')));
    assert.ok(existsSync(path.join(out, 'graph/index.html')));
    assert.ok(existsSync(path.join(out, 'collections/spaceflight/index.html')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BCE event dates, typed relations, and inline neighborhood graph work end-to-end', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-typed-'));
  try {
    const file = path.join(dir, 'wiki.json');
    create(file, 'History Wiki');
    const typedChanges = [
      { id: 'source:uruk', from: '2026-01-01', node: { kind: 'source', title: 'Book History Pack', url: 'https://chronoscope.hopperlabs.ai/#/book-history' } },
      { id: 'article:book-history', from: '2026-01-01', node: { kind: 'article', title: 'History of the Book', category: 'Chronoscope Collections', entityType: 'collection', homepage: 'https://chronoscope.hopperlabs.ai/#/book-history', relations: [{ to: 'article:hopper-books', rel: 'covered-in' }], related: [], sources: ['source:uruk'] } },
      { id: 'article:hopper-books', from: '2026-01-01', node: { kind: 'article', title: 'Hopper Books', category: 'Hopper Labs Sites', entityType: 'site', homepage: 'https://books.hopperlabs.ai/', relations: [{ to: 'article:book-history', rel: 'related' }], related: [], sources: ['source:uruk'] } },
      { id: 'event:cuneiform', from: '2026-01-01', node: { kind: 'event', articles: ['article:book-history'], title: 'Cuneiform writing at Uruk', date: '-3300', sources: ['source:uruk'] } },
      { id: 'event:gutenberg', from: '2026-01-01', node: { kind: 'event', articles: ['article:book-history'], title: 'Gutenberg press in Mainz', date: '1455', sources: ['source:uruk'] } },
    ];
    publish(file, { base: null, message: 'Add typed BCE history', changes: typedChanges });
    const g = load(file);
    const p = project(g, 'book-history', { validAt: '2026-01-01' });
    assert.equal(p.events[0].date, '-3300');
    assert.equal(formatEventDate(p.events[0].date), '3300 BCE');
    assert.equal(p.events[1].date, '1455');
    assert.equal(p.related[0].rel, 'covered-in');
    assert.equal(graphIndex(g, { validAt: '2026-01-01' }).edges.length, 2);

    const out = path.join(dir, 'public');
    exportWiki(g, out, { origin: 'https://example.org' });
    const html = readFileSync(path.join(out, 'wiki/book-history/index.html'), 'utf8');
    assert.match(html, /3300 BCE/);
    assert.match(html, /class="graph-map"/);
    assert.match(html, /Covered in/);
    assert.doesNotMatch(html, /\sstyle="/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scaffold and built-in markdown, catalog, and chronoscope importers produce publishable proposals', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-creator-'));
  try {
    const proj = path.join(dir, 'starter');
    const scaf = await operate(proj, 'scaffold', { title: 'Creator Wiki', origin: 'https://creator.example.org' });
    assert.ok(scaf.files.includes('content/welcome.md'));

    const graphPath = path.join(proj, 'wiki.json');
    await operate(graphPath, 'init', { title: 'Creator Wiki' });
    const mdProp = await operate(graphPath, 'import', {
      adapter: 'markdown',
      directory: path.join(proj, 'content'),
      defaultSourceTitle: 'Creator Wiki',
      defaultSourceUrl: 'https://creator.example.org',
    });
    await operate(graphPath, 'publish', { proposal: mdProp });

    // Import a synthetic Chronoscope pack
    const packDir = path.join(dir, 'pack-test');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(path.join(packDir, 'view.json'), JSON.stringify({ id: 'sample-pack', title: 'Sample Pack', subtitle: '1900-2026', about: 'Test pack.' }));
    writeFileSync(path.join(packDir, 'entries.json'), JSON.stringify([
      { id: 'sample-pack:1900-start', start: '1900', label: 'First milestone', importance: 1, note: { what: 'Verified milestone.', basis: ['https://example.org/source'] } },
    ]));
    const chronoProp = await operate(graphPath, 'import', { adapter: 'chronoscope', directory: packDir, commit: 'abc1234' });
    await operate(graphPath, 'publish', { proposal: chronoProp });

    const out = path.join(proj, 'public');
    const exported = await operate(graphPath, 'export', { directory: out, origin: 'https://creator.example.org' });
    assert.ok(exported.pages >= 5);
    const welcome = await operate(graphPath, 'read', { slug: 'welcome' });
    assert.equal(welcome.related[0].slug, 'how-to-edit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('large multi-collection graph validates quickly and emits scoped navigation without bloating HTML', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-scale-'));
  try {
    const g = initialize('Scale Wiki');
    const bulk = [{ id: 'source:main', from: '2026-01-01', node: { kind: 'source', title: 'Primary index', url: 'https://example.org/index' } }];
    for (let i = 0; i < 120; i++) {
      const cat = `Collection ${i % 6}`;
      const rel = i > 0 ? [{ to: `article:item-${i - 1}`, rel: 'related' }] : [];
      bulk.push({
        id: `article:item-${i}`,
        from: '2026-01-01',
        node: { kind: 'article', title: `Item ${i}`, category: cat, entityType: 'topic', summary: `Summary for item ${i}.`, relations: rel, related: [], sources: ['source:main'] },
      });
    }
    const t0 = Date.now();
    g.revisions.push(candidate(g, { base: null, message: 'Bulk seed', changes: bulk }, '2026-01-01T12:00:00.000Z'));
    validate(g);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 2000, `Expected fast validation, took ${elapsed}ms`);

    const out = path.join(dir, 'public');
    exportWiki(g, out, { origin: 'https://example.org' });
    const articleHtml = readFileSync(path.join(out, 'wiki/item-50/index.html'), 'utf8');
    assert.ok(articleHtml.length < 18000, `Expected compact scoped HTML page, got ${articleHtml.length} bytes`);
    assert.match(articleHtml, /id="nav-search"/);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'api/search.json'))).length, 120);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('illustrations, sourced facts and citation returns follow the selected edition', () => {
  const g = initialize('Space');
  g.revisions.push(candidate(g, {base: null, message: 'First edition', changes}, '2026-01-01T10:00:00.000Z'));
  const url = changes[0].node.url;
  const article = {
    ...changes[1].node, summary: 'The Voyager mission.',
    image: {src: '/media/wiki/voyager.webp', alt: 'Voyager spacecraft', caption: 'Mission photograph',
      credit: 'NASA', creditUrl: url, license: 'Public domain', licenseUrl: url, width: 640, height: 480},
    facts: [{label: 'Mission', value: 'Voyager', sourceUrl: url}],
  };
  const change = {...changes[1], from: '2026-01-02', node: article};
  const proposal = {base: g.revisions[0].id, message: 'Add illustration', changes: [change]};
  for (const src of ['//invalid.example/file.png', 'javascript:alert(1)', '/media/wiki/../private']) {
    assert.throws(() => candidate(g, {...proposal, changes: [{...change, node: {...article, image: {...article.image, src}}}]}));
  }
  g.revisions.push(candidate(g, proposal, '2026-01-02T10:00:00.000Z'));
  assert.equal(project(articleHistoryGraph(g, 'voyager'), 'voyager', {knownAt: '2026-01-01'}).article.image, undefined);
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-reader-'));
  try {
    exportWiki(g, dir);
    const html = readFileSync(path.join(dir, 'wiki/voyager/index.html'), 'utf8');
    assert.match(html, /width="640" height="480"/);
    assert.match(html, /href="#cite-0-1"/);
    assert.match(html, /aria-label="Article contents"/);
    assert.match(readFileSync(path.join(dir, 'api/articles/voyager.md'), 'utf8'), /Voyager spacecraft/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('coverage rejects broken article mappings and emits the links counted in HTML', () => {
  const g = initialize('Space');
  g.revisions.push(candidate(g, {base: null, message: 'First edition', changes}, '2026-01-01T10:00:00.000Z'));
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-coverage-'));
  const record = {title:'Missions', source:changes[0].node.url, denominator:2, articles:['voyager']};
  try {
    exportWiki(g, dir, {coverage:[record]});
    const data = JSON.parse(readFileSync(path.join(dir,'api/coverage.json')));
    assert.equal(data.surfaces[0].matched, 1);
    assert.equal(data.surfaces[0].articles[0].href, '/wiki/voyager/');
    assert.throws(() => exportWiki(g, dir, {coverage:[{...record,articles:['absent']}]}));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('optional authoring fields survive JSON revision round trips', () => {
  const g = initialize('Space');
  const optional = {...changes[1], node:{...changes[1].node, image:undefined}};
  g.revisions.push(candidate(g, {base:null, message:'Release', changes:[changes[0],optional]}));
  validate(JSON.parse(JSON.stringify(g)));
});
