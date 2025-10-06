import { defineStore } from 'pinia';
import type { DataSet } from '@shared/types';

interface DatasetState {
  items: DataSet[];
  isLoading: boolean;
}

export interface DatasetUpsertPayload {
  datasetId?: string;
  name: string;
  description?: string;
  bindings: Record<string, unknown>;
  tagNames?: string[];
}

export const useDatasetsStore = defineStore('datasets', {
  state: (): DatasetState => ({
    items: [],
    isLoading: false,
  }),
  actions: {
    async fetchDatasets(tagNames?: string[]) {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('dataset.list', { tagNames });
        const payload = (response ?? {}) as { items?: DataSet[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
    async upsertDataset(payload: DatasetUpsertPayload) {
      const response = (await window.api.invoke('dataset.upsert', {
        datasetId: payload.datasetId,
        name: payload.name,
        description: payload.description,
        bindings: payload.bindings,
        tagNames: payload.tagNames,
      })) as { dataset?: DataSet };
      if (response?.dataset) {
        const index = this.items.findIndex((item) => item.id === response.dataset!.id);
        if (index >= 0) {
          this.items.splice(index, 1, response.dataset);
        } else {
          this.items = [response.dataset, ...this.items];
        }
      }
      return response?.dataset;
    },
  },
});
