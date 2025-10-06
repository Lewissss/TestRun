import { defineStore } from 'pinia';
import type { RunResultSummary, RunSummaryDetail } from '@shared/types';

interface RunState {
  items: RunResultSummary[];
  isRunning: boolean;
  subscribed: boolean;
  logs: Record<string, string[]>;
  currentRunId: string | null;
  summaryByRun: Record<string, SummaryStats | undefined>;
  summaryDetailsByRun: Record<string, RunSummaryDetail[] | undefined>;
}

interface RunnerEventRecord {
  id: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  startedAt: string;
  completedAt?: string;
  testIds: string[];
  summaryPath?: string;
  logPath?: string;
  summaryJsonPath?: string;
}

interface RunnerEvent {
  type: 'start' | 'stdout' | 'stderr' | 'exit' | 'stopped';
  runId: string;
  data?: string;
  record?: RunnerEventRecord;
}

interface SummaryStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

function toSummary(record?: RunnerEventRecord | null): RunResultSummary | null {
  if (!record) return null;
  return {
    id: record.id,
    testId: record.testIds.join(', '),
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    summaryPath: record.summaryPath,
    logPath: record.logPath,
    summaryJsonPath: record.summaryJsonPath,
  };
}

export const useRunsStore = defineStore('runs', {
  state: (): RunState => ({
    items: [],
    isRunning: false,
    subscribed: false,
    logs: {},
    currentRunId: null,
    summaryByRun: {},
    summaryDetailsByRun: {},
  }),
  getters: {
    getLog: (state) => (runId: string) => state.logs[runId]?.join('') ?? '',
    getSummary: (state) => (runId: string) => state.summaryByRun[runId],
    getSummaryDetails: (state) => (runId: string) => state.summaryDetailsByRun[runId] ?? [],
  },
  actions: {
    ensureSubscription() {
      if (this.subscribed) return;
      window.api.on('runner:event', (_event, payload) => {
        const raw = payload as RunnerEvent;
        if (!raw) return;

        if (raw.type === 'start' && raw.record) {
          const summary = toSummary(raw.record);
          if (summary) {
            this.items.unshift(summary);
            this.logs[summary.id] = [];
            this.isRunning = true;
            this.currentRunId = summary.id;
          }
          return;
        }

        if ((raw.type === 'stdout' || raw.type === 'stderr') && raw.data) {
          const existing = this.logs[raw.runId] ?? [];
          this.logs = {
            ...this.logs,
            [raw.runId]: [...existing, raw.data],
          };
          return;
        }

        if (raw.type === 'exit' && raw.record) {
          const summary = toSummary(raw.record);
          if (summary) {
            const index = this.items.findIndex((item) => item.id === summary.id);
            if (index >= 0) {
              this.items.splice(index, 1, summary);
            } else {
              this.items.unshift(summary);
            }
            if (raw.record.summaryJsonPath) {
              void this.fetchSummary(raw.runId, raw.record.summaryJsonPath);
            }
          }
          this.isRunning = false;
          this.currentRunId = null;
          return;
        }

        if (raw.type === 'stopped') {
          this.isRunning = false;
          this.currentRunId = null;
        }
      });
      this.subscribed = true;
    },
    async fetchHistory(limit = 50) {
      const response = (await window.api.invoke('runner.history', { limit })) as {
        items?: Array<{
          id: string;
          status: string;
          testIds: unknown;
          startedAt: string;
          completedAt?: string | null;
          logPath?: string | null;
          summaryPath?: string | null;
          summaryJsonPath?: string | null;
        }>;
      };
      const items = response?.items ?? [];
      this.summaryByRun = {};
      this.summaryDetailsByRun = {};
      this.items = items.map((item) => ({
        id: item.id,
        testId: Array.isArray(item.testIds) ? (item.testIds as string[]).join(', ') : String(item.testIds ?? ''),
        status: item.status as RunResultSummary['status'],
        startedAt: item.startedAt,
        completedAt: item.completedAt ?? undefined,
        summaryPath: item.summaryPath ?? undefined,
        logPath: item.logPath ?? undefined,
        summaryJsonPath: item.summaryJsonPath ?? undefined,
      }));
      this.items.forEach((item) => {
        if (item.summaryJsonPath) {
          void this.fetchSummary(item.id, item.summaryJsonPath);
        }
      });
    },
    async fetchSummary(runId: string, jsonPath?: string | null) {
      const targetPath = jsonPath ?? this.items.find((item) => item.id === runId)?.summaryJsonPath;
      if (!targetPath) return;
      try {
        const response = (await window.api.invoke('runner.summary', { path: targetPath })) as {
          stats?: SummaryStats;
          details?: RunSummaryDetail[];
        };
        if (response?.stats) {
          this.summaryByRun[runId] = response.stats;
        }
        if (response?.details) {
          this.summaryDetailsByRun[runId] = response.details;
        }
      } catch (error) {
        console.warn('Failed to fetch run summary', error);
      }
    },
    async startRun(testIds: string[], options: { headed?: boolean; workers?: number } = {}) {
      this.ensureSubscription();
      await window.api.invoke('runner.start', {
        testIds,
        headed: options.headed,
        workers: options.workers,
      });
    },
    async stopRun(runId: string) {
      await window.api.invoke('runner.stop', { runId });
    },
  },
});
