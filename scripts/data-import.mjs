import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { prisma } from '../app/main/db/client.js';

const args = process.argv.slice(2);
let inputArg;
let force = false;
let includeRuns = false;

for (const arg of args) {
  if (arg === '--force' || arg === '-f') {
    force = true;
  } else if (arg === '--include-runs') {
    includeRuns = true;
  } else if (arg.startsWith('-')) {
    console.warn(`Ignoring unknown flag ${arg}`);
  } else if (!inputArg) {
    inputArg = arg;
  } else {
    console.warn(`Ignoring extra positional argument ${arg}`);
  }
}

const defaultPath = join(process.cwd(), 'data', 'exports', 'testrun-data.json');
const INPUT_FILE =
  inputArg && isAbsolute(inputArg) ? inputArg : inputArg ? join(process.cwd(), inputArg) : defaultPath;

if (!force) {
  console.error('Refusing to import without --force (operation clears existing local data).');
  console.error('Usage: node ./scripts/data-import.mjs [export.json] --force [--include-runs]');
  process.exit(1);
}

async function clearTables(client, options = { includeRuns: false }) {
  const { includeRuns: includeRunResults } = options;
  if (includeRunResults) {
    await client.runResult.deleteMany();
  }
  await client.apiRequest.deleteMany();
  await client.apiSession.deleteMany();
  await client.apiBlock.deleteMany();
  await client.environment.deleteMany();
  await client.step.deleteMany();
  await client.param.deleteMany();
  await client.stepTemplate.deleteMany();
  await client.testCase.deleteMany();
  await client.dataSet.deleteMany();
  await client.recording.deleteMany();
  await client.tag.deleteMany();
}

function toTagConnections(tagMap, tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (!tag) return undefined;
      if (typeof tag.id === 'string') return tag.id;
      if (typeof tag.name === 'string') return tagMap.get(tag.name);
      return undefined;
    })
    .filter((id) => typeof id === 'string')
    .map((id) => ({ id }));
}

async function importData() {
  const raw = await readFile(INPUT_FILE, 'utf8');
  const payload = JSON.parse(raw);

  await prisma.$transaction(async (tx) => {
    await clearTables(tx, { includeRuns });

    const tagMap = new Map();
    if (Array.isArray(payload.tags)) {
      for (const tag of payload.tags) {
        const created = await tx.tag.create({ data: { id: tag.id, name: tag.name } });
        tagMap.set(tag.name, created.id);
      }
    }

    const connectTags = (tags) => toTagConnections(tagMap, tags);

    if (Array.isArray(payload.environments)) {
      for (const environment of payload.environments) {
        await tx.environment.create({
          data: {
            id: environment.id,
            name: environment.name,
            description: environment.description,
            variables: environment.variables,
          },
        });
      }
    }

    if (Array.isArray(payload.recordings)) {
      for (const recording of payload.recordings) {
        await tx.recording.create({
          data: {
            id: recording.id,
            name: recording.name,
            description: recording.description,
            baseUrl: recording.baseUrl,
            viewportW: recording.viewportW,
            viewportH: recording.viewportH,
            scale: recording.scale,
            traceZipPath: recording.traceZipPath,
            flowLogPath: recording.flowLogPath,
            steps: {
              create: Array.isArray(recording.steps)
                ? recording.steps.map((step) => ({
                    id: step.id,
                    index: step.index,
                    type: step.type,
                    route: step.route,
                    selector: step.selector,
                    role: step.role,
                    name: step.name,
                    testid: step.testid,
                    apiHints: step.apiHints,
                    screenshot: step.screenshot,
                    customName: step.customName,
                    deleted: step.deleted,
                    paramHints: step.paramHints,
                  }))
                : [],
            },
            tags: {
              connect: connectTags(recording.tags),
            },
          },
        });
      }
    }

    if (Array.isArray(payload.blocks)) {
      for (const block of payload.blocks) {
        await tx.stepTemplate.create({
          data: {
            id: block.id,
            title: block.title,
            description: block.description,
            version: block.version,
            block: block.block,
            params: {
              create: Array.isArray(block.params)
                ? block.params.map((param) => ({
                    id: param.id,
                    name: param.name,
                    label: param.label,
                    type: param.type,
                    required: param.required,
                    defaultValue: param.defaultValue,
                    enumValues: param.enumValues,
                  }))
                : [],
            },
            tags: {
              connect: connectTags(block.tags),
            },
          },
        });
      }
    }

    if (Array.isArray(payload.apiBlocks)) {
      for (const block of payload.apiBlocks) {
        await tx.apiBlock.create({
          data: {
            id: block.id,
            title: block.title,
            description: block.description,
            version: block.version,
            actions: block.actions,
            params: {
              create: Array.isArray(block.params)
                ? block.params.map((param) => ({
                    id: param.id,
                    name: param.name,
                    label: param.label,
                    type: param.type,
                    required: param.required,
                    defaultValue: param.defaultValue,
                    enumValues: param.enumValues,
                  }))
                : [],
            },
            tags: {
              connect: connectTags(block.tags),
            },
          },
        });
      }
    }

    if (Array.isArray(payload.datasets)) {
      for (const dataset of payload.datasets) {
        await tx.dataSet.create({
          data: {
            id: dataset.id,
            name: dataset.name,
            description: dataset.description,
            bindings: dataset.bindings,
            tags: {
              connect: connectTags(dataset.tags),
            },
          },
        });
      }
    }

    if (Array.isArray(payload.tests)) {
      for (const test of payload.tests) {
        await tx.testCase.create({
          data: {
            id: test.id,
            title: test.title,
            filePath: test.filePath,
            composition: test.composition,
            snapshotDir: test.snapshotDir,
            environment: test.environmentId
              ? {
                  connect: { id: test.environmentId },
                }
              : undefined,
            tags: {
              connect: connectTags(test.tags),
            },
          },
        });
      }
    }

    if (Array.isArray(payload.apiSessions)) {
      for (const session of payload.apiSessions) {
        await tx.apiSession.create({
          data: {
            id: session.id,
            name: session.name,
            description: session.description,
            baseUrl: session.baseUrl,
            tags: {
              connect: connectTags(session.tags),
            },
            requests: {
              create: Array.isArray(session.requests)
                ? session.requests.map((request) => ({
                    id: request.id,
                    name: request.name,
                    method: request.method,
                    url: request.url,
                    headers: request.headers,
                    query: request.query,
                    bodyMode: request.bodyMode,
                    body: request.body,
                    auth: request.auth,
                    preScripts: request.preScripts,
                    postScripts: request.postScripts,
                    assertions: request.assertions,
                    lastStatus: request.lastStatus,
                    lastLatencyMs: request.lastLatencyMs,
                    lastRespHeaders: request.lastRespHeaders,
                    lastRespBody: request.lastRespBody,
                  }))
                : [],
            },
          },
        });
      }
    }
  });

  console.log(`Imported TestRun data from ${INPUT_FILE}${includeRuns ? ' (run history replaced).' : '.'}`);
  if (!includeRuns) {
    console.log('Run history was preserved. Pass --include-runs to reset RunResult records as well.');
  }
}

importData()
  .catch((error) => {
    console.error('Failed to import data', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
