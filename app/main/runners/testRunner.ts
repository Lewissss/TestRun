import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface RunOptions {
  cwd: string;
  testIds: string[];
  headed?: boolean;
  workers?: number;
  env?: Record<string, string | undefined>;
}

export interface RunEventMap {
  stdout: string;
  stderr: string;
  exit: { code: number | null };
}

export class TestRun extends EventEmitter {
  private child?: ReturnType<typeof spawn>;

  start(options: RunOptions) {
    const specPaths = options.testIds.map((id) => `tests/generated/${id}.spec.ts`);
    const htmlReporter = options.env?.PLAYWRIGHT_HTML_REPORT ?? process.env.PLAYWRIGHT_HTML_REPORT ?? 'tests/reports/html';
    const jsonReporter = options.env?.PLAYWRIGHT_JSON_REPORT ?? process.env.PLAYWRIGHT_JSON_REPORT ?? 'tests/reports/json/run.json';
    const args = [
      'playwright',
      'test',
      ...specPaths,
      `--reporter=list,html=${htmlReporter},json=${jsonReporter}`,
    ];
    if (options.headed) args.push('--headed');
    if (options.workers) args.push(`--workers=${options.workers}`);

    this.child = spawn('npx', args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child.stdout?.on('data', (chunk) => {
      this.emit('stdout', chunk.toString());
    });

    this.child.stderr?.on('data', (chunk) => {
      this.emit('stderr', chunk.toString());
    });

    this.child.on('close', (code) => {
      this.emit('exit', { code });
    });
  }

  stop() {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGINT');
    }
  }
}
