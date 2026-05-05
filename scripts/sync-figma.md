# Figma Mapping Sync — Runbook

The inspector ships a static `public/figma-mapping.json` that links token
prefixes (e.g. `button`, `input`) to Figma node URLs. When a user selects
a component-layer token, the inspector embeds the matching Figma frame.

This file describes how to populate that mapping by running Figma MCP
tools inside a Claude Code session. There is **no** runtime MCP — the
deployed static site only reads the pre-baked JSON.

## Steps

1. Get the Figma file URL of the source library from the user.
   It looks like `https://www.figma.com/design/<fileKey>/<name>`.

2. Identify the components to map. Token prefixes worth mapping are the
   distinct top-level segments of `component` layer node ids — usually
   `button`, `input`, `card`, `modal`, `badge`, etc. Derive them from
   the user's loaded graph or skim `components/global.tokens.json`.

3. For each prefix, find the matching Figma node:
   - Call `mcp__plugin_figma_figma__search_design_system` with a query
     like `"Button"` against the file's library.
   - Or call `mcp__plugin_figma_figma__get_metadata` with the fileKey
     and explore the page tree to find the canonical component node.
   - Capture the node id (format `1:234`).

4. Build the node URL:
   `https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeIdWithDash>`
   where `<nodeIdWithDash>` is the node id with `:` replaced by `-`
   (Figma's URL convention).

5. Optionally fetch a screenshot for offline preview:
   `mcp__plugin_figma_figma__get_screenshot` with fileKey + nodeId,
   write the PNG into `public/figma-screenshots/<prefix>.png`, and set
   `screenshot: "/figma-screenshots/<prefix>.png"` on the entry.

6. Write the mapping into `public/figma-mapping.json`:

```json
{
  "source": "https://www.figma.com/design/<fileKey>/<name>",
  "syncedAt": "<ISO timestamp>",
  "components": [
    {
      "prefix": "button",
      "label": "Button",
      "url": "https://www.figma.com/design/<fileKey>/<name>?node-id=1-234"
    },
    {
      "prefix": "input",
      "label": "Input",
      "url": "https://www.figma.com/design/<fileKey>/<name>?node-id=1-235"
    }
  ]
}
```

7. Verify: `npm run dev`, drop the token JSONs, select a `button-*`
   token. The Figma frame should embed below the token preview.

## Constraints

- The Figma file must be **share-link enabled** (or public) for the
  iframe embed to render. If it's private, the embed shows a sign-in
  prompt to the viewer.
- Prefer one URL per prefix. The inspector matches by longest prefix,
  so `button-solid-*` can have its own entry that overrides `button`.
- Re-run this sync when the source Figma file changes meaningfully.
