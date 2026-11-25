---
name: maintain-wiki
description: Use Wiki Maker to inspect a sourced graph, propose a dated correction and review its effects.
---
Run `wiki-maker find` or the `wiki_find` MCP tool to locate the subject, then read it at the event date and the current knowledge cutoff. Check the original source and its publication date. Reuse the existing source and event IDs. Give new claims a source, an article ID and the first date they apply. Keep inference and forecasts in editorial sections.
Use `wiki_propose` with the changes and a precise revision message. Inspect `wiki_preview`, including removed sources and intervals. Validate, then publish the reviewed proposal to the same local graph. A changed base requires a fresh diff. Check an earlier knownAt snapshot and the new snapshot. Export a new public site from an empty directory.
