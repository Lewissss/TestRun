import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TestRun, type RunOptions } from '../runners/testRunner';
import { createRunResult, updateRunResult } from '../db/repositories';

const LOGS_DIR = join(process.cwd(), 'tests', 'logs');
const REPORTS_DIR = join(process.cwd(), 'tests', 'reports');
const HTML_REPORT_DIR = join(REPORTS_DIR, 'html');
const JSON_REPORT_DIR = join(REPORTS_DIR, 'json');

export interface StartRunOptions {
  testIds: string[];
  headed?: boolean;
  workers?: number;
}

export interface RunRecord {
  id: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  startedAt: string;
  completedAt?: string;
  testIds: string[];
  logPath?: string;
  summaryPath?: string;
  summaryJsonPath?: string;
}

const activeRuns = new Map<string, { runner: TestRun; record: RunRecord; logStream: ReturnType<typeof createWriteStream> | null }>();

function broadcast(event: string, payload: unknown) {
  const window = BrowserWindow.getAllWindows()[0];
  window?.webContents.send(event, payload);
}

export async function startRun(options: StartRunOptions): Promise<RunRecord> {
  const runId = randomUUID();
  const startedAt = new Date();
  await Promise.all([
    mkdir(LOGS_DIR, { recursive: true }),
    mkdir(HTML_REPORT_DIR, { recursive: true }),
    mkdir(JSON_REPORT_DIR, { recursive: true }),
  ]);

  const logPath = join(LOGS_DIR, `${runId}.log`);
  const htmlDir = join(HTML_REPORT_DIR, runId);
  const summaryPath = join(htmlDir, 'index.html');
  const summaryJsonPath = join(JSON_REPORT_DIR, `${runId}.json`);

  const record: RunRecord = {
    id: runId,
    status: 'running',
    startedAt: startedAt.toISOString(),
    testIds: options.testIds,
    logPath,
    summaryPath,
    summaryJsonPath,
  };

  const runner = new TestRun();
  const logStream = createWriteStream(logPath, { flags: 'a' });
  activeRuns.set(runId, { runner, record, logStream });

  await createRunResult({
    id: runId,
    status: record.status,
    testIds: options.testIds,
    startedAt,
    logPath,
    summaryPath,
    summaryJsonPath,
  }).catch((error) => console.error('Failed to persist run record', error));

  runner.on('stdout', (data: string) => {
    logStream.write(data);
    broadcast('runner:event', { type: 'stdout', runId, data });
  });

  runner.on('stderr', (data: string) => {
    logStream.write(data);
    broadcast('runner:event', { type: 'stderr', runId, data });
  });

  runner.on('exit', async ({ code }) => {
    const entry = activeRuns.get(runId);
    if (!entry) return;
    entry.logStream?.end();
    entry.record.status = code === 0 ? 'passed' : 'failed';
    entry.record.completedAt = new Date().toISOString();
    await updateRunResult(runId, {
      status: entry.record.status,
      completedAt: new Date(entry.record.completedAt),
      summaryPath,
      summaryJsonPath,
    }).catch((error) => console.error('Failed to update run record', error));
    broadcast('runner:event', { type: 'exit', runId, record: entry.record });
    activeRuns.delete(runId);
  });

  broadcast('runner:event', { type: 'start', runId, record });

  const runOptions: RunOptions = {
    cwd: process.cwd(),
    testIds: options.testIds,
    headed: options.headed,
    workers: options.workers,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'production',
      PLAYWRIGHT_HTML_REPORT: htmlDir,
      PLAYWRIGHT_JSON_REPORT: summaryJsonPath,
    },
  };

  runner.start(runOptions);
  return record;
}

export function stopRun(runId: string): void {
  const entry = activeRuns.get(runId);
  if (!entry) return;
  entry.runner.stop();
  entry.logStream?.end();
  void updateRunResult(runId, {
    status: 'failed',
    completedAt: new Date(),
  }).catch((error) => console.error('Failed to update run record on stop', error));
  broadcast('runner:event', { type: 'stopped', runId });
  activeRuns.delete(runId);
}
