import fs from 'node:fs';
import { load, validate, create, project, find, diff, head, publish, graphIndex } from './graph.mjs';
import { exportWiki } from './site.mjs';
import { importMarkdown, importCatalog, importChronoscope, scaffoldWiki } from './importers.mjs';

const string = { type: 'string' }, object = { type: 'object' }, number = { type: 'number' };

export const ops = {
  init: ['Create a new local wiki.', { title: string }, ['title']],
  scaffold: ['Create a ready-to-publish standalone wiki project directory with starter Markdown and CI.', { title: string, origin: string }, ['title']],
  find: ['Find articles by title, alias, category, entity type, or summary.', { query: string, validAt: string, knownAt: string }, []],
  read: ['Read one sourced article as of two independent dates.', { slug: string, validAt: string, knownAt: string }, ['slug']],
  graph: ['Inspect the typed wiki graph topology (categories, nodes, and relations).', { validAt: string, knownAt: string }, []],
  changes: ['List recorded revisions after an optional timestamp.', { since: string }, []],
  import: ['Build a sourced change proposal from Markdown files, a JSON catalog, or a Chronoscope pack.', { adapter: string, message: string, directory: string, file: string, category: string, from: string, defaultSourceTitle: string, defaultSourceUrl: string, entityType: string, packId: string, origin: string, commit: string, maxEvents: number, slugPrefix: string }, ['adapter']],
  propose: ['Create a sourced change proposal against the current graph head.', { message: string, changes: { type: 'array', items: object } }, ['message', 'changes']],
  preview: ['Show the before and after of every proposed change.', { proposal: object }, ['proposal']],
  validate: ['Check graph identities, time intervals, citations and references.', { proposal: object }, []],
  publish: ['Apply the reviewed proposal to the expected local head.', { proposal: object }, ['proposal']],
  export: ['Build a standalone website, graph explorer, collection hubs, timeline, feed, Markdown and JSON from the local graph.', { directory: string, origin: string }, ['directory']],
};

export const readers = ['find', 'read', 'graph', 'changes', 'validate'];

export async function operate(location, name, args = {}) {
  if (!Object.hasOwn(ops, name)) throw Error('Unknown operation');
  const remote = location.startsWith('https://');
  if (remote && (!readers.includes(name) || args.proposal)) throw Error('Remote graphs are read only');
  if (name === 'init') { create(location, args.title); return { initialized: true }; }
  if (name === 'scaffold') return scaffoldWiki({ directory: location, title: args.title, origin: args.origin });

  let g;
  if (remote) {
    const u = new URL(location);
    if (u.username || u.password) throw Error('Invalid graph address');
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error('Graph read failed (' + r.status + ')');
    g = validate(await r.json());
  } else {
    g = load(location);
  }

  switch (name) {
    case 'find': return find(g, args.query || '', args);
    case 'read': { const p = project(g, args.slug, args); if (!p) throw Error('No article at these dates'); return p; }
    case 'graph': return graphIndex(g, args);
    case 'changes': return g.revisions.filter(r => !args.since || r.recordedAt > args.since).map(({ id, recordedAt, message }) => ({ id, recordedAt, message }));
    case 'import': {
      let changes;
      if (args.adapter === 'markdown') changes = importMarkdown(args);
      else if (args.adapter === 'json' || args.adapter === 'catalog') changes = importCatalog(args);
      else if (args.adapter === 'chronoscope') changes = importChronoscope(args);
      else throw Error('Unknown import adapter: ' + args.adapter);
      const proposal = { base: head(g), message: args.message || `Import ${args.adapter} source`, changes };
      diff(g, proposal);
      return proposal;
    }
    case 'propose': { const proposal = { base: head(g), message: args.message, changes: args.changes }; diff(g, proposal); return proposal; }
    case 'preview': return diff(g, args.proposal);
    case 'validate': if (args.proposal) diff(g, args.proposal); return { valid: true, head: head(g) };
    case 'publish': return { revision: publish(location, args.proposal) };
    case 'export': {
      if (fs.existsSync(args.directory) && fs.readdirSync(args.directory).length) throw Error('Choose an empty export directory');
      const pages = exportWiki(g, args.directory, { origin: args.origin });
      return { pages: pages.length, revision: head(g) };
    }
  }
}
