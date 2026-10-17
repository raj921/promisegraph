# Third-party source and modifications

Source licenses and author notices are retained in `licenses/`. Dependency licenses also apply to installed packages and bundled assets.

| Component | Original source and revision | Local adaptation |
|---|---|---|
| Rowboat graph view (retained reference; no longer rendered) | `rowboatlabs/rowboat` · `eb3122953a4bdb96ba43914bc12ed763202ea976` · `apps/x/apps/renderer/src/components/graph-view.tsx` | `src/vendor/rowboat-graph.tsx`: local input adapter, accessible keyboard selection, disable decorative floating motion and reduce initial settling under reduced motion; exploratory mode capped at 100 entities |
| Rowboat incremental graph state | Same revision · `apps/x/packages/core/src/knowledge/graph_state.ts` | `tools/rowboat-source-state.ts`: configurable and destination-specific data directories, atomic checkpoint writes, acknowledged content snapshots, symbolic-link exclusion, content verification even when modification time matches unless explicitly trusted |
| Memory Store capture queue | `julep-ai/memory-store-plugin` · `33955178c515864c87038b4fdf78ef7100c5a068` · `scripts/queue-memory.sh` | `tools/capture-memory.sh`: configurable queue path, owner-only creation permissions, complete JSON escaping and bounded importance values; new flush tool connects the public JSONL format to our graph writer with acknowledgement checks and interrupted-batch recovery |
| Memory Store agent workflow | `julep-ai/mem-plugins` · `3143cfdcf3ebff4c58ce7380d4d3eea635242a39` · `plugins/memory-store/skills/memory-store-basics/SKILL.md` | `server/deepseek.ts`: adapted policy for relevant evidence, confirmed outcomes and execution receipts; not a copy of its unpublished server |
| 21st TextShimmer | https://agent-elements.21st.dev/r/text-shimmer.json · retrieved 15 October 2026 | `src/vendor/text-shimmer.tsx`: import path adapted; local theme and reduced-motion CSS. MIT license, Copyright (c) 2026 21st.dev |

Original source links:

- https://github.com/rowboatlabs/rowboat/tree/eb3122953a4bdb96ba43914bc12ed763202ea976
- https://github.com/julep-ai/memory-store-plugin/tree/33955178c515864c87038b4fdf78ef7100c5a068
- https://github.com/julep-ai/mem-plugins/tree/3143cfdcf3ebff4c58ce7380d4d3eea635242a39
- https://github.com/21st-dev/agent-elements

The application-specific schema, Cypher repository, API, review workflow, dependency-path composition, and integration glue were written for PromiseGraph. Reusing these public components does not imply affiliation, endorsement, or access to private competitor systems.

FalkorDB and Redis native distributions have their own licenses. The macOS setup helper preserves the license shipped in the official PyPI wheel. Docker/remote operators must retain the notices applicable to their database distribution.

The upstream renderer NOTICE is retained in licenses/rowboat-renderer-upstream-NOTICE.md for source provenance. Its PPTX sections describe upstream code; the PPTX files are not used by PromiseGraph.

## Registry frontend refresh · 15 October 2026

Original registry snapshots and SHA-256 provenance are recorded in `component-sources/manifest.json`.

| Published source | Files and local adaptations |
|---|---|
| Aceternity Sidebar and Bento Grid · https://ui.aceternity.com | `src/vendor/aceternity/`: original published structure; local imports, semantic anchor props, shared theme tokens, and a shadcn focus-trapped mobile navigation dialog. Author license: https://ui.aceternity.com/licence |
| shadcn/ui · https://ui.shadcn.com/r/styles/new-york/ and new-york-v4/native-select.json | `src/vendor/shadcn/`: 12 published components, local utility import and a Vite-controlled Sonner theme. MIT, copyright (c) 2023 shadcn; full license in licenses/shadcn-ui-MIT.txt |
| Componentry Circuit Board · https://componentry.dev/r/circuit-board.json | `src/vendor/componentry/circuit-board.tsx`: published renderer; Motion import, shared colors, unique SVG IDs, keyboard/click selection, reduced motion and a full-text caption tooltip. Unused demonstration components removed. Catalogue lists MIT; see licenses/componentry-NOTICE.md |
| Inter Variable · @fontsource-variable/inter 5.3.0 | Self-hosted font assets; SIL Open Font License retained in the npm package |
| Tabler icons · @tabler/icons-react 3.49.0 | Aceternity's published icon dependency; MIT, notice retained in package |

Visual reference: https://design.interfere.com/ . Its observed neutral surfaces, blue brand color, type scale, borders and radius scale inform shared semantic application tokens. No proprietary reference font or artwork was copied.
