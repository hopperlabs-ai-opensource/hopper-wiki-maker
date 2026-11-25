# Hopper Wiki Maker

Wiki Maker publishes an independent wiki from an append-only graph. Articles, editorial sections, examples, evidence and shared events have stable IDs. Every revision has a SHA-256 digest and a parent. A source correction can take effect in the past without changing what a reader could have known before the correction was recorded.

## Make a second wiki

Clone this repository, enter the checkout and run the following with Node 22 or newer. There are no runtime dependencies.

```sh
node bin/wiki.mjs init space.json '{"title":"Spaceflight Wiki"}'
node bin/wiki.mjs propose space.json @examples/spaceflight/encounter.json > proposal.json
```

To give the same proposal to preview, validation and publication, wrap it once.

```sh
node -e 'console.log(JSON.stringify({proposal:require("./proposal.json")}))' > review.json
node bin/wiki.mjs preview space.json @review.json
node bin/wiki.mjs validate space.json @review.json
node bin/wiki.mjs publish space.json @review.json
node bin/wiki.mjs export space.json '{"directory":"public","origin":"https://example.org"}'
```

Publish the contents of `public/` on your static host. Open `/wiki/voyager/`, `/timeline/`, `/api/articles/voyager.md` and `/api/articles/voyager.json`. Export to an empty folder for each new release. `feed.json` lists revisions and affected article IDs. `api/graph.json` and `api/revisions/<hash>.json` carry the original records. `api/diffs/<hash>.json` shows the before/after for each change.

## Time and evidence

`from` is an inclusive valid date. `until` is an optional exclusive end. A release records its actual UTC time. To reproduce a view, supply both `validAt` and `knownAt`. With a date-only knowledge cutoff the reader uses the end of that UTC day. Event labels retain their source precision. An editor can keep month/year-only events out of an as-of view until the end of that month/year. An article can have several revisions for the same valid date. Proposals must identify the exact parent. Concurrent or stale updates are rejected. To retract a node for an interval, publish a change with `node: null`. Rebuilds check citations at every interval boundary.

## CLI, HTTP and agent access

The local CLI and stdio MCP use the same operations. Run `node bin/wiki.mjs mcp space.json` as a local MCP command. Configure an agent with `node bin/wiki.mjs mcp https://wiki.hopperlabs.ai/api/graph.json` to read the published graph. `wiki_find`, `wiki_read` and `wiki_changes` return the latest or requested times. The wiki page registers read tools in browsers supporting WebMCP. Other clients can follow the JSON and Markdown links directly.

For a local HTTP read API, run `node bin/wiki.mjs serve space.json 8787` and request `/api/read?slug=voyager&validAt=1980-11-12`. Use the `maintain-wiki` skill to propose, preview and validate sourced edits locally. Publication is an explicit operation. The public site requires no model or database at request time. An LLM editor submits the same sourced proposals as a person.

## Graph ownership

The Wiki graph owns editorial records. External records can carry an owner, record ID, revision, content digest and original public URL. These references preserve source ownership across wikis and timeline collections. Browser pages and agent exports use the same graph projection.

Run `node --test` to check bitemporal corrections, stale-head rejection, evidence requirements and the second-wiki export.
