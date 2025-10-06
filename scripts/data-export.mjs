import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../app/main/db/client.js';

const OUTPUT_DIR = join(process.cwd(), 'data', 'exports');
const OUTPUT_FILE = join(OUTPUT_DIR, 'testrun-data.json');

async function exportData() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const recordings = await prisma.recording.findMany({
    include: {
      steps: { orderBy: { index: 'asc' } },
      tags: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const blocks = await prisma.stepTemplate.findMany({
    include: { params: true, tags: true },
    orderBy: { updatedAt: 'desc' },
  });

  const apiBlocks = await prisma.apiBlock.findMany({
    include: { params: true, tags: true },
    orderBy: { updatedAt: 'desc' },
  });

  const tests = await prisma.testCase.findMany({
    include: { tags: true, environment: true },
    orderBy: { createdAt: 'desc' },
  });

  const datasets = await prisma.dataSet.findMany({
    include: { tags: true },
    orderBy: { name: 'asc' },
  });

  const apiSessions = await prisma.apiSession.findMany({
    include: { tags: true, requests: { orderBy: { updatedAt: 'desc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  const environments = await prisma.environment.findMany({ orderBy: { name: 'asc' } });

  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });

  const payload = {
    exportedAt: new Date().toISOString(),
    recordings,
    blocks,
    apiBlocks,
    tests,
    datasets,
    apiSessions,
    environments,
    tags,
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Exported TestRun data to ${OUTPUT_FILE}`);
}

exportData()
  .catch((error) => {
    console.error('Failed to export data', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
