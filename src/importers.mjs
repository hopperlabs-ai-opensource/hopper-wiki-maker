import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { date, eventDate, slugKey, safeUrl } from './graph.mjs';

const cleanSlug = (value) => slugKey(value).slice(0, 80);
const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!key) continue;
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: match[2] };
}

function collectMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full);
  }
  return results.sort();
}

/** Convert a directory of Markdown files with YAML frontmatter and [[wikilinks]] into reviewable graph changes. */
export function importMarkdown({
  directory,
  category = 'General',
  from = new Date().toISOString().slice(0, 10),
  defaultSourceTitle = '',
  defaultSourceUrl = '',
  entityType = '',
} = {}) {
  if (!directory) throw Error('Missing directory for markdown importer');
  date(from);
  if (defaultSourceUrl) safeUrl(defaultSourceUrl);
  const files = collectMarkdownFiles(path.resolve(directory));
  if (!files.length) throw Error('No .md files found in ' + directory);

  const docs = files.map(file => {
    const raw = fs.readFileSync(file, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const base = path.basename(file, '.md');
    const slug = cleanSlug(meta.slug || base);
    const title = meta.title || base.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { file, meta, body, slug, title };
  });
  const knownSlugs = new Set(docs.map(d => d.slug));
  const changes = [];
  const seenSources = new Set();

  const addSource = (id, title, url, dFrom) => {
    if (seenSources.has(id)) return;
    safeUrl(url);
    seenSources.add(id);
    changes.push({ id, from: dFrom, node: { kind: 'source', title, url } });
  };

  for (const doc of docs) {
    const dFrom = doc.meta.from ? date(doc.meta.from) : from;
    const srcUrl = doc.meta.source_url || doc.meta.homepage || defaultSourceUrl;
    const srcTitle = doc.meta.source_title || doc.title || defaultSourceTitle;
    if (!srcUrl) throw Error(`Missing source_url, homepage, or defaultSourceUrl for ${doc.file}`);
    const srcId = 'source:' + cleanSlug(doc.slug + '-ref');
    addSource(srcId, srcTitle, srcUrl, dFrom);

    const wikiLinks = [...doc.body.matchAll(/\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/gi)]
      .map(m => cleanSlug(m[1]))
      .filter(s => s !== doc.slug && knownSlugs.has(s));
    const frontRelated = (Array.isArray(doc.meta.related) ? doc.meta.related : [])
      .map(s => s.startsWith('article:') ? s : 'article:' + cleanSlug(s));
    const related = [...new Set([...frontRelated, ...wikiLinks.map(s => 'article:' + s)])];

    const parts = doc.body.split(/^##\s+/m);
    const lead = parts[0].replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi, (_, s, l) => l || s).trim();
    const summary = doc.meta.summary || lead.split(/\r?\n\r?\n/)[0]?.trim() || doc.title;

    const articleNode = {
      kind: 'article',
      title: doc.title,
      category: doc.meta.category || category,
      summary,
      ...(doc.meta.entityType || entityType ? { entityType: doc.meta.entityType || entityType } : {}),
      ...(doc.meta.homepage ? { homepage: doc.meta.homepage } : {}),
      ...(Array.isArray(doc.meta.aliases) && doc.meta.aliases.length ? { aliases: doc.meta.aliases.map(cleanSlug) } : {}),
      related,
      sources: [srcId],
    };
    changes.push({ id: 'article:' + doc.slug, from: dFrom, node: articleNode });

    parts.slice(1).forEach((chunk, idx) => {
      const nl = chunk.indexOf('\n');
      const secTitle = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
      const secText = (nl < 0 ? '' : chunk.slice(nl + 1))
        .replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi, (_, s, l) => l || s)
        .replace(/\r?\n+/g, ' ')
        .trim();
      if (!secTitle || !secText) return;
      changes.push({
        id: 'section:' + cleanSlug(`${doc.slug}-${idx}-${secTitle}`),
        from: dFrom,
        node: { kind: 'section', article: 'article:' + doc.slug, title: secTitle, text: secText, order: idx, sources: [srcId] },
      });
    });
  }
  return changes;
}

/** Convert a structured JSON catalog of sites, apps, products or topics into reviewable graph changes. */
export function importCatalog({
  file,
  items,
  from = new Date().toISOString().slice(0, 10),
  defaultCategory = 'Catalog',
} = {}) {
  date(from);
  const rows = items ?? (file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : null);
  if (!Array.isArray(rows) || !rows.length) throw Error('Catalog importer requires a non-empty items array or JSON file');

  const changes = [];
  const seenSources = new Set();
  for (const item of rows) {
    const slug = cleanSlug(item.slug || item.id || item.title);
    const dFrom = item.from ? date(item.from) : from;
    const srcList = item.sources?.length
      ? item.sources
      : (item.homepage ? [{ id: 'source:' + cleanSlug(slug + '-home'), title: item.title, url: item.homepage }] : []);
    if (!srcList.length) throw Error('Missing source or homepage for catalog item ' + slug);

    const srcIds = [];
    for (const s of srcList) {
      const sid = s.id.startsWith('source:') ? s.id : 'source:' + cleanSlug(s.id);
      srcIds.push(sid);
      if (!seenSources.has(sid)) {
        safeUrl(s.url);
        seenSources.add(sid);
        changes.push({ id: sid, from: dFrom, node: { kind: 'source', title: s.title, url: s.url } });
      }
    }

    const articleNode = {
      kind: 'article',
      title: item.title,
      category: item.category || defaultCategory,
      summary: item.summary || item.title,
      ...(item.entityType ? { entityType: item.entityType } : {}),
      ...(item.homepage ? { homepage: item.homepage } : {}),
      ...(item.aliases?.length ? { aliases: item.aliases } : {}),
      ...(item.relations?.length ? { relations: item.relations } : {}),
      related: item.related || [],
      sources: srcIds,
    };
    changes.push({ id: 'article:' + slug, from: dFrom, node: articleNode });

    (item.sections || []).forEach((sec, idx) => {
      changes.push({
        id: 'section:' + cleanSlug(`${slug}-${idx}-${sec.title}`),
        from: dFrom,
        node: {
          kind: 'section',
          article: 'article:' + slug,
          title: sec.title,
          text: sec.text,
          order: sec.order ?? idx,
          ...(sec.steps?.length ? { steps: sec.steps } : {}),
          sources: sec.sources?.length ? sec.sources : srcIds,
        },
      });
    });

    (item.links || []).forEach((lnk, idx) => {
      safeUrl(lnk.url);
      changes.push({
        id: 'link:' + cleanSlug(`${slug}-${idx}-${lnk.title}`),
        from: dFrom,
        node: {
          kind: 'link',
          article: 'article:' + slug,
          title: lnk.title,
          url: lnk.url,
          order: lnk.order ?? idx,
          sources: lnk.sources?.length ? lnk.sources : srcIds,
        },
      });
    });
  }
  return changes;
}

/** Import a Chronoscope pack directory into reviewable wiki graph changes with exact SHA-256 ownerRef provenance. */
export function importChronoscope({
  directory,
  packId,
  origin = 'https://chronoscope.hopperlabs.ai',
  commit = 'local',
  maxEvents = 12,
  category = 'Chronoscope Collections',
  from = new Date().toISOString().slice(0, 10),
  slugPrefix = '',
} = {}) {
  if (!directory) throw Error('Missing directory for chronoscope importer');
  date(from);
  safeUrl(origin);
  const packDir = path.resolve(directory);
  const viewPath = path.join(packDir, 'view.json');
  const entriesPath = path.join(packDir, 'entries.json');
  if (!fs.existsSync(viewPath) || !fs.existsSync(entriesPath)) {
    throw Error('Chronoscope pack requires view.json and entries.json in ' + packDir);
  }
  const viewRaw = fs.readFileSync(viewPath);
  const entriesRaw = fs.readFileSync(entriesPath);
  const view = JSON.parse(viewRaw.toString('utf8'));
  const entriesParsed = JSON.parse(entriesRaw.toString('utf8'));
  const entries = Array.isArray(entriesParsed) ? entriesParsed : (entriesParsed.entries || []);
  const packSlug = cleanSlug(packId || view.id || path.basename(packDir));
  const articleSlug = slugPrefix ? cleanSlug(slugPrefix + '-' + packSlug) : packSlug;
  const packDigest = 'sha256:' + sha256Hex(Buffer.concat([viewRaw, entriesRaw]));
  const packUrl = `${origin.replace(/\/$/, '')}/#/${encodeURIComponent(view.id || packSlug)}`;

  const receiptMap = new Map();
  const sourcesPath = path.join(packDir, 'sources.json');
  if (fs.existsSync(sourcesPath)) {
    const sRaw = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    const list = Array.isArray(sRaw) ? sRaw : (sRaw.receipts || []);
    for (const r of list) {
      if (r?.url && r.url.startsWith('https://')) receiptMap.set(r.url, r.title || r.url);
    }
  }

  const changes = [];
  const seenSources = new Set();
  const packSourceId = 'source:' + cleanSlug(`chronoscope-${packSlug}`);
  seenSources.add(packSourceId);
  changes.push({
    id: packSourceId,
    from,
    node: { kind: 'source', title: `Chronoscope: ${view.title || packSlug}`, url: packUrl },
  });

  const subtitle = view.subtitle ? `${view.subtitle}. ` : '';
  const about = (view.about || view.description || view.lead || '').trim();
  const summary = about || `${view.title || packSlug} timeline on Chronoscope (${subtitle}${entries.length} documented entries).`;

  changes.push({
    id: 'article:' + articleSlug,
    from,
    node: {
      kind: 'article',
      title: view.title || packSlug,
      category,
      entityType: 'collection',
      homepage: packUrl,
      summary: summary.length > 340 ? summary.slice(0, 337).replace(/\s+\S*$/, '') + '…' : summary,
      related: [],
      sources: [packSourceId],
    },
  });

  changes.push({
    id: 'section:' + cleanSlug(`${articleSlug}-overview`),
    from,
    node: {
      kind: 'section',
      article: 'article:' + articleSlug,
      title: 'Scope and historical coverage',
      text: `${about || `${view.title || packSlug} is a documented Chronoscope timeline collection.`} This Chronoscope pack holds ${entries.length} dated entries${view.subtitle ? ` (${view.subtitle})` : ''} with source provenance retained in the upstream pack.`,
      order: 0,
      sources: [packSourceId],
    },
  });

  changes.push({
    id: 'link:' + cleanSlug(`${articleSlug}-open-chronoscope`),
    from,
    node: {
      kind: 'link',
      article: 'article:' + articleSlug,
      title: `Explore the full ${view.title || packSlug} timeline on Chronoscope`,
      url: packUrl,
      order: 0,
      sources: [packSourceId],
    },
  });

  // Select top landmark events (importance 1 first, then chronological spread)
  const validEntries = entries.filter(e => {
    try { eventDate(String(e.start || '')); return Boolean(e.label); } catch { return false; }
  });
  const sorted = [...validEntries].sort((a, b) => (a.importance ?? 3) - (b.importance ?? 3));
  const picked = sorted.slice(0, Math.max(0, maxEvents));

  picked.forEach((e, idx) => {
    const startStr = String(e.start);
    const basisUrls = (Array.isArray(e.note?.basis) ? e.note.basis : (e.source ? [e.source] : []))
      .filter(u => typeof u === 'string' && u.startsWith('https://'));
    const evSources = [packSourceId];
    for (const u of basisUrls.slice(0, 2)) {
      try {
        safeUrl(u);
        const sid = 'source:' + cleanSlug(`ref-${sha256Hex(u).slice(0, 12)}`);
        if (!seenSources.has(sid)) {
          seenSources.add(sid);
          changes.push({ id: sid, from, node: { kind: 'source', title: receiptMap.get(u) || new URL(u).hostname, url: u } });
        }
        if (!evSources.includes(sid)) evSources.push(sid);
      } catch { /* ignore non-HTTPS/malformed basis entries */ }
    }
    const evUrl = `${packUrl}/x/${encodeURIComponent(e.id || String(idx))}`;
    const detail = (e.note?.what || '').trim();
    const version = /^[a-z0-9][a-z0-9._:/@-]{0,239}$/.test(commit) ? commit : 'local';
    changes.push({
      id: 'event:' + cleanSlug(`${articleSlug}-${idx}-${sha256Hex(e.id || e.label).slice(0, 8)}`),
      from,
      node: {
        kind: 'event',
        articles: ['article:' + articleSlug],
        title: String(e.label).trim(),
        date: startStr,
        ...(detail ? { detail: detail.length > 260 ? detail.slice(0, 257).replace(/\s+\S*$/, '') + '…' : detail } : {}),
        chronoscope: evUrl,
        ownerRef: {
          schemaVersion: 'hopper.exact-resource-ref.v1',
          productId: 'hopper.domain-app.chronoscope',
          resourceType: 'chronoscope.pack-entry',
          resourceId: String(e.id || `${packSlug}:${idx}`).toLowerCase().replace(/[^a-z0-9._:/@-]/g, '-').slice(0, 239),
          version,
          digest: packDigest,
        },
        sources: evSources,
      },
    });
  });

  return changes;
}

/** Scaffold a standalone, zero-dependency wiki repository ready for local editing and static publishing. */
export function scaffoldWiki({ directory, title = 'My Graph Wiki', origin = 'https://example.org' } = {}) {
  if (!directory) throw Error('Missing target directory');
  safeUrl(origin);
  const root = path.resolve(directory);
  if (fs.existsSync(root) && fs.readdirSync(root).length) {
    throw Error('Choose a new or empty directory to scaffold');
  }
  const write = (rel, content) => {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const today = new Date().toISOString().slice(0, 10);
  write('package.json', JSON.stringify({
    name: cleanSlug(title),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      'import:md': `wiki-maker import wiki.json '{"adapter":"markdown","directory":"content","defaultSourceTitle":"${title}","defaultSourceUrl":"${origin}"}' > proposal.json`,
      build: `rm -rf public && wiki-maker export wiki.json '{"directory":"public","origin":"${origin}"}'`,
      mcp: 'wiki-maker mcp wiki.json',
      serve: 'wiki-maker serve wiki.json 8787',
    },
    dependencies: {
      '@hopperlabs/wiki-maker': '^0.3.0',
    },
  }, null, 2) + '\n');

  write('content/welcome.md', `---
title: ${title}
slug: welcome
category: Overview
entityType: topic
from: ${today}
source_title: ${title} home
source_url: ${origin}
---

Welcome to ${title}, a bitemporal, source-grounded graph wiki built with Hopper Wiki Maker.

## How this wiki works

Every article, section, and milestone lives in an append-only SHA-256 revision graph. See [[how-to-edit]] to propose cited changes using the CLI or MCP.
`);

  write('content/how-to-edit.md', `---
title: How to edit this wiki
slug: how-to-edit
category: Overview
entityType: concept
from: ${today}
source_title: Hopper Wiki Maker repository
source_url: https://github.com/hopperlabs-ai-opensource/hopper-wiki-maker
---

Edits are proposed as sourced graph diffs, validated at every time interval, and published explicitly.

## Propose, preview, validate, publish

Run the markdown importer or submit a JSON proposal against the current graph head, inspect the diff, and export static HTML, JSON, Markdown, and WebMCP assets to public/. Links like [[welcome]] automatically build the wiki graph.
`);

  write('.github/workflows/publish-wiki.yml', `name: Build and publish wiki
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: public
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`);

  write('README.md', `# ${title}

A sourced, bitemporal graph wiki powered by [Hopper Wiki Maker](https://github.com/hopperlabs-ai-opensource/hopper-wiki-maker).

## Quick start

\`\`\`sh
npm install
npx wiki-maker init wiki.json '{"title":"${title}"}'
npm run import:md
node -e 'console.log(JSON.stringify({proposal:JSON.parse(require("fs").readFileSync("proposal.json","utf8"))}))' > review.json
npx wiki-maker preview wiki.json @review.json
npx wiki-maker publish wiki.json @review.json
npm run build
\`\`\`

Deploy \`public/\` to GitHub Pages, Cloudflare Pages, Vercel, or any static host.
`);

  return { directory: root, files: ['package.json', 'content/welcome.md', 'content/how-to-edit.md', '.github/workflows/publish-wiki.yml', 'README.md'] };
}
