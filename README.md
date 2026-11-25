# Hopper Wiki Maker

Wiki Maker builds a fast, static, **sourced bitemporal graph wiki** for both human readers and AI agents—with zero runtime dependencies. Every article, section, example, milestone, and typed relation lives in an append-only SHA-256 revision chain.

## Start your own wiki in 2 minutes

Clone this repository (or install `@hopperlabs/wiki-maker`) with Node.js 22 or newer:

```sh
node bin/wiki.mjs scaffold my-wiki '{"title":"My Knowledge Wiki","origin":"https://example.org"}'
cd my-wiki
node ../bin/wiki.mjs init wiki.json '{"title":"My Knowledge Wiki"}'
node ../bin/wiki.mjs import wiki.json '{"adapter":"markdown","directory":"content","defaultSourceTitle":"My Knowledge Wiki","defaultSourceUrl":"https://example.org"}' > proposal.json
node -e 'console.log(JSON.stringify({proposal:JSON.parse(require("fs").readFileSync("proposal.json","utf8"))}))' > review.json
node ../bin/wiki.mjs preview wiki.json @review.json
node ../bin/wiki.mjs publish wiki.json @review.json
node ../bin/wiki.mjs export wiki.json '{"directory":"public","origin":"https://example.org"}'
```

Deploy `public/` to GitHub Pages, Cloudflare Pages, Vercel, or any static host (the `scaffold` command includes a GitHub Pages workflow).

## Built-in importers (federated ownership)

Wiki Maker separates **owned editorial prose** from **upstream source systems**. Every importer produces a reviewable `proposal` (never mutating the graph directly):

- **Markdown folder (`adapter: "markdown"`)** — Imports `.md` files with YAML frontmatter (`title`, `slug`, `category`, `entityType`, `homepage`, `source_url`, `related`) and automatically turns `[[wikilinks]]` into graph edges.
- **Structured JSON catalog (`adapter: "json"`)** — Imports arrays of sites, apps, products, people, or concepts with typed `relations` (`powers`, `uses`, `part-of`, `chronicles`, `covered-in`, `implements`, `built-with`, `related`).
- **Chronoscope pack (`adapter: "chronoscope"`)** — Imports any Chronoscope pack (`view.json`, `entries.json`, optional `sources.json`), preserving BCE and CE dates, primary source receipts, Chronoscope deep links, and `hopper.exact-resource-ref.v1` SHA-256 digests.

## What `export` builds

From one validated graph, `export` emits:
- Reader pages: `/` (index + instant search), `/collections/<key>/` (collection hubs), `/graph/` (interactive Graph Explorer), `/timeline/` (shared history), and `/wiki/<slug>/` (article with inline SVG neighborhood graph, worked examples, milestone chart, references, and Time View).
- Sharded agent & browser data: `/api/index.json`, `/api/search.json`, `/api/graph-index.json`, `/api/articles/<slug>.json`, `/api/articles/<slug>.md`, `/api/history/<slug>.json` (compact per-article bitemporal history shard), `/api/collections/<key>.json`, `/api/timeline.json`, `/api/revisions/<hash>.json`, `/api/diffs/<hash>.json`, `/feed.json`, and `/llms.txt`.

## Time, typed graphs, and evidence

- `from` is an inclusive valid date (`YYYY-MM-DD`); `until` is an optional exclusive end. Historical `event.date` values support both CE and BCE dates (for example `-3300` renders as `3300 BCE`).
- Every revision records its UTC `recordedAt` timestamp, exact `parent` digest, and SHA-256 revision ID. Stale proposals are rejected; citations and references are verified incrementally across interval boundaries.
- Articles can declare an `entityType`, public `homepage`, and typed `relations: [{ to, rel }]`, automatically computing incoming `backlinks` and visual neighborhood graphs.

## CLI, HTTP, MCP, and WebMCP

The CLI, local HTTP read API, stdio MCP server, and WebMCP browser tools share the same operation definitions:

```sh
# Local or remote stdio MCP server
node bin/wiki.mjs mcp wiki.json
node bin/wiki.mjs mcp https://wiki.hopperlabs.ai/api/graph.json

# Read-only local HTTP API
node bin/wiki.mjs serve wiki.json 8787
```

Use the bundled `skills/maintain-wiki` skill to teach coding agents to propose, preview, validate, and publish cited graph edits.

Run `node --test` to verify bitemporal corrections, BCE dates, typed relations, importers, scaffolding, sharded exports, and large-graph validation speed.
