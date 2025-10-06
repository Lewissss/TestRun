# TestRun Architecture Guide

## High-Level Components
- **Electron Main Process** (`app/main`)
  - Window lifecycle (`main.ts`), preload bridge (`preload.ts`), IPC handlers (`ipc.ts`).
  - Worker modules for recording, screenshot extraction, code generation, and test execution (`app/main/runners`).
  - Optional AI service (`ai/service.ts`) that stores encrypted OpenUI API keys via Electron safeStorage, gates all LLM calls, and exposes helper methods (selector repair, summaries, triage) to IPC.
- **Renderer** (`app/renderer`)
  - Vue 3 SPA with Pinia stores, Vue Router, TailwindCSS styling, and Naive UI components.
  - Flowchart-based test composition via Vue Flow and Dagre layout.
  - `aiStore` centralizes the “LLM enabled” flag so views can grey out AI affordances until a key is configured.
- **Shared Modules** (`app/shared`)
  - Type definitions (`types.ts`), selector heuristics, and Handlebars templates for Playwright code generation.
- **Database Layer** (`prisma` + `app/main/db`)
  - SQLite (`data/app.db`) via Prisma ORM for recordings, steps, blocks, tests, datasets, tags, and run results.
  - JSON export/import utilities live under `scripts/data-*.mjs` to support Git-friendly collaboration.
- **Playwright Integration**
  - Recorder launches headed Playwright contexts with tracing enabled.
  - Generator emits reusable block modules and spec files from templates.
  - Runner spawns `npx playwright test`, captures JSON/HTML/log outputs, and streams IPC events.

## Data Flow
1. **Recording**
   - Recorder worker captures trace.zip + steps → extractor derives screenshots → generator normalizes selectors.
   - Prisma models persist recordings, steps, parameter hints, and tags.

2. **Block Creation**
   - Blocks created from recordings or manual JSON input → stored with params, expectations, tags, and version number.
   - Shared templates render block functions (TypeScript) consumed by generated tests.

3. **Test Composition**
   - Composer flowchart constructs `TestCase.composition` as ordered blocks with bindings & expectations.
   - Codegen worker reads block metadata + composition JSON to emit Playwright spec and block module files.
   - Baseline screenshots copied into Playwright snapshot directories for visual regression.

4. **Test Execution**
   - Runner spawns Playwright with HTML + JSON reporters and stores artifacts under `tests/`.
   - IPC events stream stdout/stderr/exit status; Prisma stores run record with artifact paths.
   - Renderer aggregates JSON summary → displays counts + per-test breakdown.

## Key Technologies
- **Electron + Vite**: Main/preload builds via `vite-plugin-electron`; renderer via standard Vite config.
- **Vue 3 (script setup)**: Reactive state managed by Pinia; UI styled with Tailwind and Naive UI components.
- **Vue Flow + Dagre**: Visual graphs for test composition and flow visualization, providing auto layout and node interactions.
- **Prisma ORM**: Single SQLite database (`appdata/app.db`) with migrations versioned under `prisma/migrations`.
- **Playwright**: Recording, assertions, screenshot comparisons, and JSON/HTML reporting.

## IPC Contracts (Selected)
- `block.create`, `block.update`, `block.list`, `block.get`
- `test.compose`, `test.update`, `test.list`
- `dataset.upsert`, `dataset.list`
- `runner.start`, `runner.stop`, `runner.history`, `runner.summary`, `runner.openArtifact`
- `recording.list` (existing recorder interactions)
- `ai.settings.get|update|setKey|clearKey|test`
- `ai.selectorRepair`, `ai.stepSummaries`, `ai.tagSuggest`, `ai.assertSuggest`, `ai.nlToComposition`, `ai.failureTriage`, `ai.visualTriage`

## Code Generation Path
1. `TestComposer` saves composition JSON (blocks + expectations + meta).
2. `composeTestCase` (main/services) resolves blocks, writes block modules (Handlebars), and creates spec file via templates.
3. Playwright specs ingest block functions, base URL, viewport, and expectations to produce deterministic automation code.

## Runner Artifacts
- **Log files**: `tests/logs/<runId>.log`
- **HTML report**: `tests/reports/html/<runId>/index.html`
- **JSON report**: `tests/reports/json/<runId>.json`
- **Snapshots**: `tests/__screenshots__/<testId>/`

Renderer maps run IDs to artifacts, enabling the Runner view to open logs/reports and display summary stats.

### API mode pipelines
- **Database models**: `ApiSession`, `ApiRequest`, `ApiBlock`, and `Environment` extend the Prisma schema. Sessions link to requests; API blocks reuse the shared `Param` table; tests can reference an `Environment`.
- **IPC**: `api.session.*`, `api.request.*`, `api.block.*`, and `env.*` handlers in `app/main/ipc.ts` manage CRUD, import/export, and console request execution (via Playwright's `APIRequestContext`). Payloads are validated with Zod.
- **Runtime**: `app/shared/runtime/api.ts` executes API workflows, handling placeholder interpolation, sandboxed pre/post scripts, assertions, captures, and log aggregation.
- **Codegen**: `generateApiBlockModule` + `apiBlock.ts.hbs` emit block modules that call `executeApiActions`. `test.ts.hbs` orchestrates hybrid flows, sharing a `ctx` object, environment variables, and dataset bindings across UI and API steps.
- **Renderer**: `ApiConsoleView.vue`, `apiSessionsStore`, `apiBlocksStore`, and environment store manage console state, imports, and block creation. Test composer/flow views display mixed UI/API nodes with shared bindings.

## Build & Packaging Pipeline
- `npm run build`: Vite builds renderer (ESM), Electron main/preload.
- `npm run package:mac`: electron-builder → DMG.
- `npm run package:win`: electron-builder → NSIS executable.
- `npm run data:export` / `npm run data:import -- --force`: Share state across engineers via Git (one repo per application).
- CI should run `npm run typecheck`, `npm run build`, `npm run playwright:test`, then package per target.

## Extensibility Notes
- **Expectations**: Additional operators can be added centrally in `ExpectationEditor` and shared schema.
- **Flowchart Layout**: Dagre rankdir options can produce vertical flows; edges/nodes customizable via Vue Flow slots.
- **Runner Enhancements**: JSON summary introspection currently exposes counts/tests; detailed per-step screenshots can be linked via metadata.
- **LLM Assistants**: `ai/service.ts` wraps all OpenUI calls, enforces opt-in gating, and provides fallbacks for selector repair, summaries, natural-language authoring, and failure triage.

## Folder Reference
```
app/
  main/
    ipc.ts            # IPC handlers
    services/         # Business logic (composer, run manager)
    runners/          # Recorder, generator, runner workers
  renderer/
    components/       # Vue components (flowchart, expectation editor)
    views/            # Route views (Composer, Runner, Flowchart)
    stores/           # Pinia stores (tests, runs, blocks, datasets)
  shared/             # Types, codegen templates, utilities
prisma/
  schema.prisma       # Database schema
  migrations/         # SQL migrations
scripts/              # Helper scripts (clean, db prepare)
docs/                 # Architecture & Usage guides
```

## Contact Points (Agents)
- AGENTS.md aggregates responsibilities for automation, recording, and packaging tasks.
