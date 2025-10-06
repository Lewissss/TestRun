# TestRun Agent Handbook

## Ownership & Responsibilities
- **Recording & Extraction**: Recorder worker (`app/main/runners/recorder.ts`) and screenshot extractor. Coordinate with Prisma models (`Recording`, `Step`).
- **Block Library**: Block creation, versioning, expectations, and templates. Touch `app/main/ipc.ts`, `app/main/services/testComposer.ts`, and block-related stores in the renderer.
- **API Mode**: API console, sessions/requests, API blocks, environment management, and the API runtime (`app/shared/runtime/api.ts`). Coordinate import/export flows and Playwright API test generation.
- **Test Composition**: Flowchart composer (`TestComposerView.vue`) and flow visualizer (`TestCaseFlowView.vue`). Ensure bindings, expectations, and dataset integrations remain intact.
- **Runner & Reporting**: Run manager (`app/main/services/runManager.ts`), IPC (`runner.*` channels), and renderer runner store/view. Keep artifact paths and summary parsing up-to-date.
- **AI Assistance (Optional)**: OpenUI integration lives under `app/main/ai/` and `app/renderer/stores/ai.ts`. Maintain gating logic so the app remains fully functional offline; new AI features must respect the `ai.enabled` flag and handle missing keys gracefully.
- **Database & Schema**: Prisma schema + migrations. All schema updates must include migrations and regenerate client.
- **Packaging & Release**: Scripts `package:mac` and `package:win` wrap electron-builder; ensure `npm run build` succeeds beforehand.

## Development Checklist
1. `npm run typecheck`
2. `npm run build`
3. `npm run playwright:test`
4. Verify **Settings → LLM** gating (AI disabled by default, features unlock when a test key is stored)
5. Update docs (README, docs/Usage.md, docs/Architecture.md) when workflows change
6. Run `npm run package:mac` / `npm run package:win` to validate distribution where relevant

## Collaboration Notes
- IPC contracts must be validated with Zod; update both main and renderer when adding endpoints.
- Composition JSON is the interface between renderer and generator; maintain backward compatibility when possible.
- Flowchart UX relies on Vue Flow + Dagre; layout adjustments should preserve node IDs to avoid losing bindings.
- Expectations operate per block; new operators should be reflected in both front-end editor and generator logic.
- Runs persist artifacts in `tests/`; clean up or rotate logs via scripts if disk usage becomes an issue.

## Onboarding Quick Links
- Architecture: `docs/Architecture.md`
- Usage: `docs/Usage.md`
- Prisma schema: `prisma/schema.prisma`
- Main IPC entry point: `app/main/ipc.ts`
- Runner store/UI: `app/renderer/stores/runs.ts`, `app/renderer/views/TestRunnerView.vue`
