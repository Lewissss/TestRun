import { defineStore } from 'pinia';
import type { Expectation, TestCase } from '@shared/types';

interface TestsState {
  items: TestCase[];
  isLoading: boolean;
  selectedTestId: string | null;
  selectedTest?: TestCase;
}

export interface ComposeTestPayload {
  testId?: string;
  title: string;
  blocks: Array<{
    kind: 'ui' | 'api';
    blockId: string;
    version: number;
    bindings: Record<string, unknown>;
    expectations?: Expectation[];
  }>;
  baseUrl: string;
  viewport: { width: number; height: number; scale?: number };
  tagNames?: string[];
  datasetId?: string;
  environmentId?: string;
}

export const useTestsStore = defineStore('tests', {
  state: (): TestsState => ({
    items: [],
    isLoading: false,
    selectedTestId: null,
    selectedTest: undefined,
  }),
  getters: {
    selected(state): TestCase | undefined {
      return state.selectedTest ?? state.items.find((item) => item.id === state.selectedTestId);
    },
  },
  actions: {
    async fetchTests(tagNames?: string[]) {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('test.list', { tagNames });
        const payload = (response ?? {}) as { items?: TestCase[] };
        this.items = payload.items ?? [];
        if (this.selectedTestId) {
          this.selectedTest = this.items.find((item) => item.id === this.selectedTestId);
        }
      } finally {
        this.isLoading = false;
      }
    },
    selectTest(id: string | null) {
      this.selectedTestId = id;
      this.selectedTest = this.items.find((item) => item.id === id);
    },
    async composeTest(payload: ComposeTestPayload) {
      const result = await window.api.invoke('test.compose', payload);
      await this.fetchTests();
      return result;
    },
  },
});
