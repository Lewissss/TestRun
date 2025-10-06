# TestRun Usage Guide

## Overview
TestRun is a local, offline-first desktop application for recording, composing, and executing Playwright user journeys. The UI is built with Vue 3, TailwindCSS, and Naive UI, running inside Electron.

## Prerequisites
- Node.js 18+
- npm 9+
- Playwright dependencies (`npx playwright install` if prompted)
- macOS, Windows, or Linux for Electron runtime

## Quick Start
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Prepare the database**
   ```bash
   npm run db:prepare
   ```
3. **Launch in development**
   ```bash
   npm run dev
   ```
4. **Build production artifacts**
   ```bash
   npm run build
   ```
5. **Package distributables**
   ```bash
   npm run package:mac   # macOS dmg
   npm run package:win   # Windows exe
   ```

## Sharing Project Data
- All persisted state lives in `data/app.db` (SQLite). Commit this file when you want to share the current workspace; it is small and diffable via binary.
- Prefer exporting structured JSON for code review:
  ```bash
  npm run data:export                     # writes data/exports/testrun-data.json
  npm run data:import -- --force          # loads JSON back into SQLite (preserves run history)
  npm run data:import -- --force --include-runs  # optional: replace run history too
  ```
- Recommended pattern: one Git repository per application under test. Commit:
  - `/data/app.db`
  - `/data/exports/testrun-data.json`
  - `/tests/generated` artifacts needed for automation
- When cloning a repo, run `npm run data:import -- --force` to hydrate the local database before opening the app.
- The import script refuses to run without `--force` to avoid accidental data loss.

## Core Workflows
### Recording Journeys
- Open the **Recordings** view and start a headed Playwright session.
- The recorder captures each user interaction, storing tracing artifacts and screenshots.
- Recorded steps automatically infer selectors, parameter hints, and API metadata for later reuse.

### Building Blocks
- Navigate to **Blocks** to save steps or groups of steps as reusable, parameterized templates.
- Each block includes bindings, typed parameters, and optional expectations (e.g., asserting element existence).
- Tag blocks for discovery and version them when changes are required.

### Composing Tests
- Use the **Composer** view to drag blocks into an auto-laid flowchart.
- Select nodes to edit parameter bindings, attach expectations, and adjust dataset usage.
- Tests can be saved as new specs or update existing ones, with Playwright codegen handled by the generator worker.

### Visualizing Test Flows
- The **Flowchart** view lists existing tests as interactive graphs.
- Click nodes to inspect bindings, parameters, and expectations for each block.

### Data Sets & Tags
- Manage reusable key/value bindings in **Data Sets**. Datasets can be attached to tests to drive data iterations.
- Organize recordings, blocks, datasets, and tests with tags in the **Suites** view.

### Running Tests
- The **Runner** view lets you select tests, configure headed/headless mode, choose worker count, and launch executions.
- Live logs stream into the console. Artifact buttons open HTML reports or log files.
- Summary stats and a per-test breakdown table are generated from Playwright JSON reports.

### AI Assistance (Optional)
- All AI-powered actions are disabled until you store a valid OpenUI API key in **Settings → LLM**. The key is encrypted locally via Electron safeStorage and never synced to Git.
- Once enabled, the following helpers appear across the app:
  - **Recording Editor**: repair selectors and generate step labels.
  - **Blocks Library**: suggest tags and assertions for new blocks.
  - **Composer**: convert natural language instructions into test compositions and add assertions to selected nodes.
  - **Runner**: triage failed runs and classify screenshot diffs.
- Remove or invalidate the key to instantly revert to the offline-only experience. No network calls are attempted while AI is disabled.

### Shipping Playwright Browsers with the App
- Install browsers once in CI/local before packaging:
  ```bash
  PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium firefox webkit
  ```
- Bundle them via `electron-builder.config.ts`:
  ```ts
  extraResources: [
    { from: 'node_modules/.cache/ms-playwright', to: 'playwright-browsers' },
  ];
  ```
- At runtime point Playwright to the bundled copy (e.g. in `app/main/main.ts`):
  ```ts
  const bundledPath = join(process.resourcesPath, 'playwright-browsers');
  if (app.isPackaged) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPath;
  }
  ```
- When packaging, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so npm/pnpm don’t re-download browsers.

- The **API Console** provides a Postman-style editor for crafting HTTP requests. Configure method, URL, query parameters, headers, body modes (JSON/Text/Form/Multipart), and optional pre/post scripts (executed in a sandbox alongside the request).
- Use the toolbar to **Import** existing collections (TestRun exports, Postman v2.1, OpenAPI 3.x) or **Export** the current API library. Imports populate API sessions, requests, and reusable API blocks.
- Requests capture response status, latency, headers, and body preview. Pretty-printed JSON is shown inline; large responses are stored under `data/responses/` with a quick link from the inspector.
- Saved requests can be promoted to parameterized **API Blocks**, complete with typed params, assertions, and captured variables that populate the shared test context.
- Manage reusable key/value pairs in **Environments** and select the active environment from the console footer. Values flow into bindings (`${ENV:*}`, `${SECRET:*}`, `${VAR:*}`) across API and UI blocks.
- API-only or hybrid flows run through the standard Runner. Playwright specs spin up both `page` and `APIRequestContext`, attach per-request logs as JSON artifacts, and surface assertion outcomes alongside UI screenshot diffs.

## Common Commands
| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Vite + Electron in development |
| `npm run build` | Production build of renderer, main, preload |
| `npm run package:mac` | Package dmg via electron-builder (run on macOS) |
| `npm run package:win` | Package NSIS executable (run on Windows or a Wine-enabled runner) |
| `npm run package:linux` | Package AppImage via electron-builder |
| `npm run typecheck` | Run Vue + TypeScript type checking |
| `npm run playwright:test` | Run Playwright suites |

## Troubleshooting
- **Missing Playwright browsers**: run `npx playwright install`.
- **Database migrations**: run `npm run prisma:migrate` for dev changes or `npm run prisma:deploy` for CI.
- **Electron build issues**: ensure `npm run build` completes before packaging; on macOS, enable code signing or use `--mac.allowInvalidSignature` for local builds.

## Support & Contributions
- Opening issues is done via AGENTS.md guidance.
- Contributions should add tests or docs for new features and run `npm run typecheck` and `npm run build` before PRs.
