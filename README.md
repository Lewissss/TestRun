# TestRun

Local, offline-first desktop workbench for capturing, curating, and replaying Playwright user journeys. Built with Electron, Vue 3, TailwindCSS, Naive UI, Pinia, Vue Router, Playwright, and Prisma/SQLite.

## Getting started

```bash
npm install
npm run db:prepare
npm run dev
```

The app boots in development mode with a Vite-powered renderer and auto-reloading Electron main process.

### Scripts

- `npm run dev` – start Vite + Electron in development mode
- `npm run build` – type-check and build renderer, main, and preload bundles
- `npm run start` – launch the packaged Electron app from the built artifacts
- `npm run typecheck` – run Vue type checker and Node type checks
- `npm run package` – build production bundles and package with electron-builder
- `npm run package:mac` – produce a macOS DMG (run on macOS for native signing)
- `npm run package:win` – produce a Windows NSIS installer (run on Windows or a Wine-enabled host)
- `npm run package:linux` – produce a Linux AppImage artifact
- `npm run prisma:generate` / `npm run prisma:migrate` / `npm run prisma:deploy` – Prisma workflows for the local SQLite database
- `npm run db:prepare` – ensure `appdata/app.db` exists and applies pending migrations
- `npm run playwright:test` – execute Playwright specs in `tests/`

## Project layout

```
app/
  main/                 # Electron main process & workers
    ipc.ts
    preload.ts
    runners/
    ai/
  renderer/             # Vue 3 + Tailwind renderer
    views/
    stores/
    components/
  shared/
    types.ts
    codegenTemplates/
prisma/schema.prisma     # Database schema
scripts/                 # Helper scripts (db, recorder SDK stubs)
tests/                   # Playwright specs (generated + ad hoc)
```

## Status

The repository currently ships with fully typed scaffolding: database schema, IPC contracts, runner stubs, renderer views/stores/components, and code generation templates. Core flows (recording, block management, composition, execution) are sketched out but require implementation work to reach production quality.

Contributions are welcome under the MIT license.

## Binding helpers

Blocks and tests support dynamic bindings inside parameter values:

- `${ENV:NAME}` – resolves from `process.env.NAME`
- `${SECRET:KEY}` – resolves from `process.env.SECRET_KEY` (falls back to `process.env.KEY`)
- `${RAND:hex8}` or `${RAND:int:100,999}` – generates random data per run
- `${DATA:key}` – pulls from the attached data set when provided

Bindings are resolved at runtime through `app/shared/runtime/bindings.ts`.

## UI walkthrough

1. **Blocks Library** – ingest recordings or author JSON blocks manually. Use the modal to paste action JSON and parameter schema.
2. **Test Composer** – drag blocks from the library, adjust parameter bindings, choose viewport + tags, then generate a Playwright spec.
3. **Data Sets** – create reusable binding maps (JSON) that can be attached during composition.
4. **Runner** – select generated tests to execute locally (headless/headed).

Generated specs live in `tests/generated` with shared block modules under `tests/blocks`.

## Optional AI Assistance

- All AI-powered helpers are gated behind **Settings → LLM**. Enter a valid OpenUI API base URL, model, and API key to enable them; the key is encrypted locally via Electron safeStorage and never synced to Git.
- With AI enabled you can:
  - Repair selectors and generate step summaries in the Recording Editor.
  - Suggest tags/assertions for new blocks in the Blocks Library.
  - Convert natural language prompts into Composer flowcharts and auto-populate expectations.
  - Triage failed runs and classify screenshot diffs inside the Runner.
- Remove or invalidate the key at any time to revert to the offline-only workflow—no network calls are attempted while AI features are disabled.

## Branding

- The TestRun visual system (colors, typography, iconography) is documented in `docs/Branding.md`.
- Regenerate icons with `node scripts/generate-brand-assets.mjs`. This updates `resources/icon.png` for Electron packaging and `public/favicon.png` for the renderer.
- Primary palette: `brand-500` indigo accents on `ink-900` surfaces with `accent-500` for success and `amberglass` for warnings.

## Runner workflow

- Pick one or more generated tests in the Runner view and click **Run Selected**. The run executes locally via Playwright and streams logs into the in-app console.
- Headed/headless mode and worker count can be toggled before launching.
- The sidebar lists recent runs (persisted to SQLite); selecting a run shows its live or archived log output.
- Use **Stop** to interrupt the active run; the log file and run status persist for later review under `tests/logs/`.
- Logs stream into the Runner view; click *Log File* to open the persisted `.log` under `tests/logs/` or *HTML Report* to launch the Playwright summary generated per run.
- Reports live in `tests/reports/html/<runId>/`; each run also stores its absolute paths in the database so the UI can reopen them later.
- **Flowchart view** – visualize test compositions as an interactive flow; click nodes to inspect bindings and params.
- Drag blocks onto the Composer canvas (flowchart) to build tests visually, swap block versions inline, duplicate/remove nodes, tweak bindings + expectations per block, and jump straight to block editing.
- Runner history surfaces pass/fail/skip counts, per-test breakdown, error text, and quick links to Playwright HTML/JSON reports, log files, and attachments.
- Share state via `data/app.db` or JSON exports (`npm run data:export` / `npm run data:import -- --force`) so each application under test can live in its own Git repository.

## API Mode

- Open the **API Console** to craft HTTP requests with headers, query parameters, body modes (JSON/Text/Form/Multipart), and pre/post execution scripts.
- Attach environments to inject reusable variables (including `${ENV:*}` and `${SECRET:*}` bindings) and switch between datasets when composing hybrid UI + API tests.
- Save individual requests or multi-step selections as reusable **API Blocks**, complete with typed parameters, assertions, and captured variables that flow into later steps.
- Import existing collections via the *Import* toolbar button (supports TestRun exports, Postman v2.1 collections, and OpenAPI 3.x documents) or export the current library directly from the console.
- Compose hybrid flows by dragging API and UI blocks together inside the Composer; generated specs spin up both `page` and `APIRequestContext` fixtures and share a `ctx` object for captured values.
- Runner reports include per-request logs and assertion outcomes as Playwright attachments, with the response inspector displaying prettified JSON bodies and quick links to persisted payloads.
