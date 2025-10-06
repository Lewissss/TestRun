import { defineStore } from 'pinia';
import type { ApiBlock } from '@shared/types';

interface ApiBlocksState {
  items: ApiBlock[];
  isLoading: boolean;
}

export interface SaveApiBlockPayload {
  id?: string;
  title: string;
  description?: string | null;
  actions: unknown;
  params: Array<{
    name: string;
    label?: string | null;
    type: string;
    required?: boolean;
    defaultValue?: string | null;
    enumValues?: string | null;
  }>;
  tagNames?: string[];
}

export const useApiBlocksStore = defineStore('apiBlocks', {
  state: (): ApiBlocksState => ({
    items: [],
    isLoading: false,
  }),
  actions: {
    async fetchBlocks(tagNames?: string[]) {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('api.block.list', { tagNames });
        const payload = (response ?? {}) as { items?: ApiBlock[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
    async saveBlock(payload: SaveApiBlockPayload) {
      const response = await window.api.invoke('api.block.save', payload);
      await this.fetchBlocks();
      return response as { apiBlockId: string; version: number };
    },
  },
});
