# PromiseGraph verification · 16 October 2026

Current scope: published-component frontend, DeepSeek extraction and drafting, human review, FalkorDB workflows and repeatable checks. This report replaces earlier session summaries; historical live passes do not certify the latest changes.

| Gate | Current result | Evidence |
|---|---|---|
| TypeScript and production build | Passed | `npm run build`, and the `build` layer of `npm run verify` |
| Controlled application checks | Passed: 34 tests | `npm run test:controlled` |
| Complete test suite / real FalkorDB integration | Passed: 37 total tests (34 controlled plus 3 integration), including restart persistence | `npm test`, and the `database` layer of `npm run verify` |
| Live DeepSeek authentication | Passed | `deepseek_auth` layer: the configured key and model were verified against the live API |
| Real model extraction and drafting | Passed | `deepseek_generation` layer: 3 grounded proposals and a model-written draft through the production adapter, no fixture substituted |
| Isolated live workflow | Passed | `live_workflow` layer: real extraction → human review → graph risk → draft → reviewed task → database restart recall, on isolated fictional data |
| Browser workflow and layout | Passed | `browser` layer: Ego drove the built app against an isolated real graph at 1440, 768 and 390 pixels |
| Full verifier | Passed: 9/9 layers, 0 failed, 0 blocked | `.data/verification.json` and `.data/verification-history.jsonl` |
| Published visual components | Passed: all 15 recorded hashes match | `component-sources/manifest.json` and original registry snapshots |
| Independent audits | Completed and triaged: frontend 12/12 checks with 6 defects, backend 7 passed / 3 partial / 0 failed with 6 defects, code and design audit with 15 findings. Fixes are listed below; the rest are in Known deviations | `.data/audits/frontend-browser-qa.md`, `.data/audits/backend-api-qa.md`, `.data/audits/code-design-audit.md` |
| Source sync / Site update | Not done | The private Site still serves the earlier frontend; no successful source push or deployment is recorded |
| Hosted backend | Not provisioned | No HTTPS Node/FalkorDB service exists yet, so the published static Site cannot use a real API |

The full verifier reports **9/9 layers passed, 0 failed and 0 blocked**. Blocked layers remain in the denominator and produce a nonzero exit status; counts describe verification coverage, not product-completion percentages. A passing controlled report applies only to its named scope.

The browser layer now writes real pixel captures to `.data/browser/*.png` (1440, 768 and 390 pixels, inbox path and workspace graph). It asserts DOM reachability rather than only the absence of overflow: every graph node and caption must be inside its board, and any graph wider than its container must be reachable by scrolling. It also requires the graph to be populated (at least 3 dependency facts and at least 10 workspace entities) before it reports layout numbers.

## Controlled coverage

- Exact-source grounding, date/schema/count validation, malformed and truncated extraction, missing credentials, provider authentication/balance/rate/availability responses, and no automatic fact approval.
- Draft risk gating, incomplete output, graph changes during generation, review/save separation, edited text, draft ownership and stale evidence during commitment reads.
- Explicit approval/rejection, forged excerpts, tentative dates, duplicate review, follow-up identity/risk/revisions, completion/reopening, memory parameterization and recall request contracts.
- Loading/error/confirmed-empty frontend states, cached workspace after a failed health poll, fixed-sidebar hover, initial theme and denied browser storage, malformed health/error replies and API acknowledgement handling.
- Folder checkpoints, changed files during upload, queue crash recovery, retries, malformed records and Unicode/control characters.

These tests exercise real application code with injected provider/query replies. They do not establish Cypher correctness or restart persistence, measure model quality, prove prompt-injection resistance, or replace interactive browser QA. The isolated `database` and `live_workflow` layers cover real queries and persistence separately.

## Corrections completed in this pass

Graph layout was the main real defect. The published CircuitBoard positions nodes at absolute pixel coordinates and its own box used to be sized to the container, so on narrower viewports the extra columns were clipped by the board instead of being scrollable. Boards are now sized to the content they really have (`src/components/use-board-width.ts`), so a graph that fits stays edge-to-edge and a graph that does not fit scrolls without losing anything. Latest recorded geometry: workspace graph fits at 819 pixels at the 1440 viewport, with 482/469 and 482/326 (scrollable) at 768 and 390; dependency path 633/633, 473/473, 352/322; zero nodes outside their board and zero unreachable at every width. The verifier previously measured during the board's entrance animation and asserted a weaker property, so it reported two nodes and a stale width; it now waits for the board to settle and asserts reachability plus a populated graph.

The extraction prompt now distinguishes the party a commitment is made to from the person who spoke. Before the fix the customer was misread as the speaker in roughly one run in four ("Mira" instead of "Lumen"); four consecutive live runs now agree.

The DeepSeek connection chip emitted status names that had no styling, so "configured" and "not configured" rendered identically. It now uses the styled variants, verified in the browser as the positive-coloured `connected` chip. The light theme's smallest text token was below 4.5:1 contrast and was raised.

Accessibility and honesty of the markup: the commitment filter row is a labelled group and the workspace graph scroller is a labelled region, both previously carrying an `aria-label` on an element with no role; the review tab now has a heading instead of jumping from `h1` to `h3`. A dead look-alike `Input` primitive whose only class did not exist was removed, and its last reference points at the vendored published input. Registry provenance snapshots are now excluded from the Tailwind scan with `@source not`.

A commitment without a named prerequisite returns `feature: null` from the graph, which the shared schema typed as `string` and name-normalisation dereferenced, so generating a draft for such a commitment would have thrown. The type is now `string | null` and the helper is null-safe.

The backend audit found three boundary defects, all reproduced, fixed and re-verified. An oversized upload returned `413` while still advertising keep-alive, so the next request on that connection failed (reproduced as `ECONNRESET` 508 ms after a 300 KB upload); the reply now closes the connection and the following request succeeds in 2 ms. Unknown `/api/*` paths fell through to the static app and answered `200 text/html` with the HTML shell; they now return a structured `404` JSON reply. The access boundary accepted a bare token without the `Bearer` scheme; a raw token now gets `401` and `Bearer` gets `200`, checked on a token-protected instance with an isolated data directory. A `Content-Type` check was not added because the Origin allowlist and access token already bound who may call the API.

The frontend audit found the follow-up dialog could not be closed with its own close control: every close attempt raised "Discard unsaved draft? Your latest edits have not been saved.", even for a saved draft that had not been edited. The dialog now compares the current text with the text it loaded, so an untouched draft closes directly, an edited draft still warns, "Keep editing" returns to it, and "Discard draft" closes both dialogs without deleting the saved draft. The same pass verified in a real browser: the commitment counter now counts the filtered list (02 at risk of 04), draft previews stop on a word, end with an ellipsis and expose the full text in a `title`, and all 17 board captions carry their full text as a tooltip. The adapted component's recorded hash and the third-party notice were updated to match.

The verifier's own browser memory check matched any element containing the saved sentence, so a browser restoring the compose box after a reload could make that match ambiguous and flaky. It now waits for the saved entry itself, which is a stricter assertion than the one it replaces.

Earlier corrections still in force: the `TextShimmer` animation now has its gradient and keyframes, `dark:` utilities are bound to the app theme with `@custom-variant dark`, mobile navigation is breakpoint-gated, theme setup runs before React and tolerates denied storage, loaded workspace data survives a failed health poll, DeepSeek setup distinguishes an unreachable provider from rejected credentials and only replaces the key after successful verification, and draft/follow-up writes reject a revision changed during loading.

## Known deviations, not fixed

- Card-like list rows are rendered with the published button primitive, so block content sits inside a `button` element. Browsers and screen readers accept it, but the markup is not strictly valid; changing it means moving those rows to a non-interactive container with an explicit interactive region.
- The vendored dialog and tooltip use `animate-in`/`fade-in-0` utilities that this project never defines, so those entrances appear instantly. Adding them would mean either a new dependency or hand-written utility CSS.
- Heading levels are not fully hierarchical on every page; only the review tab was fixed.
- The JSON API does not reject a request whose `Content-Type` is not `application/json`; the access token and Origin allowlist are the effective boundary.
- Graph nodes animate in from `scale: 0`, so in a background tab, where browsers pause animation frames, the board can look empty until the tab is visible again. This is why the verifier now activates the page and waits for every expected element before measuring.
- Re-running the fictional walkthrough re-seeds its sources as needing review, so facts that were already decided appear for review again.
- Follow-ups are tied to a graph revision, so after evidence changes an older task stays visible marked "Evidence changed" instead of being rewritten.
- At 390 pixels some list and graph children extend past the viewport inside their own scroll containers (the document itself never scrolls horizontally); that is the intended narrow-screen behaviour.
- Model quality, prompt-injection resistance and long-run behaviour are not certified by a single-pass smoke check, and no visual review of every screen state has been performed. The auditors' stated limits: Chromium only, no screen reader, remote FalkorDB mode, provider outage and retry paths, two processes on one data directory, a crash mid-extraction, a ~60,000-character source and non-macOS platforms were not exercised.

## Independent audit collection

Three read-only audits ran against the built application on 16 October; their reports are copied to `.data/audits/`.

- **Frontend browser QA** (`frontend-browser-qa.md`): 12 checks, all passed — counter against rendered rows, dependency path and provenance, human review (add, edit, approve, reject), the at-risk conflict, draft generate/edit/save/persist, follow-up create/complete/reopen, reload persistence, memory, themes and contrast, the 390-pixel drawer and overflow, keyboard focus and modal trapping, and a text audit (no filler, no nameless controls, no handler-less buttons). No console or page errors. It found 6 defects; five are fixed above and one, follow-ups accumulating per revision, is recorded as a deviation.
- **Backend and API integrity** (`backend-api-qa.md`): 7 passed, 3 partial, 0 failed — extraction grounding, the review gate and corrections, live risk recompute, live drafting with an honest receipt, restart durability, input validation, the access boundary, a secret scan of 435 files, concurrency, and receipts against the real engine. Four model calls, all to `api.deepseek.com`, on isolated ports and data directories. Its three real defects are fixed above.
- **Code and design audit** (`code-design-audit.md`): ranked findings on primitives, accessibility, status styling, dead code, tokens and build output. The fixes above came from it; the remaining items are recorded as deviations.

The reports describe their own limits (Chromium only, no screen reader, no pixel review by the auditors, and the untested areas listed under Known deviations).

## Remaining work

1. Provision a persistent HTTPS backend under your hosting choice (the existing Dockerfile expects a mounted volume at `/app/.data`, `DEEPSEEK_API_KEY` from the platform secret store, and `APP_ACCESS_TOKEN` plus `ALLOWED_ORIGINS` for a public interface), then point the frontend at it. The container path is written but was not executed here because the local Docker daemon is stopped.
2. Publish the updated private Site after the backend exists or on your instruction, preserving the project identity and owner-private audience.
3. Re-run `npm run verify` after any further change; it is the only gate that combines real DeepSeek, real FalkorDB and a real browser in one report.

There is no production fixture fallback that pretends these services are running.

## Status review — 17 October 2026

Controlled tests and the production build were rerun successfully today (4/4 controlled layers, 34 tests); all 15 current component hashes match. The most recent full live pass is `2026-10-16T07:58:43.079Z` (16 October 2026, 13:28:43 IST), with 9/9 layers passed. Checked code/build inputs have no changes newer than that pass. This review did not make fresh live AI calls or run a new browser session.

Hosted Site metadata still reports version 3 from October 15. All three audit reports are present and triaged. Submission remains unconfirmed: no public repository was found by the scoped GitHub search, and README lacks a demo-video link, explicit coding-assistant disclosure and declared track. The official rules permit complete local setup instructions plus a working demo video instead of deployment; submission closes October 18 at 11:59 PM IST.

## Submission preparation — 17 October 2026

Published and verified the public source repository at `https://github.com/raj921/promisegraph`, main branch, initial commit `26b048619e814f3de4092d53deab6b1a01f1ee76`. Credentials, graph data, dependencies and private hosting configuration are excluded. This is separate from the private Site. README now declares Company Brain, discloses AI coding/artwork assistance, documents the graph model, and includes the actual risk and evidence query patterns. No app runtime code changed in this preparation.

The registered hackathon account's submission form was inspected. Required fields are title, description, repository URL and demo-video URL; live deployment is optional. Title, description and repository are filled (3/4 required fields); the video URL is empty and submission has not been sent. The demo uses fictional data and must show real application behavior, with AI narration and no music. `demo/capture.mjs` is prepared for isolated 1080p/4K takes, but no footage has been recorded: installed Chrome exits before opening a page, and the official headless-shell download failed through the environment's proxy. ChatCut browser sign-in was attempted; the CLI could not save its credential lock due to filesystem permissions, and its MCP voice tools remain absent. These are production blockers for the requested video, not passing verification results.
