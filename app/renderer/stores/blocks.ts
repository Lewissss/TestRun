import { defineStore } from 'pinia';
import type { StepTemplate } from '@shared/types';

interface BlockState {
  items: StepTemplate[];
  isLoading: boolean;
}

export interface CreateBlockPayload {
  id?: string;
  title: string;
  description?: string;
  block: unknown;
  params?: Array<{
    name: string;
    label?: string;
    type: StepTemplate['params'][number]['type'];
    required?: boolean;
    defaultValue?: string;
    enumValues?: string;
  }>;
  tagNames?: string[];
}

export const useBlocksStore = defineStore('blocks', {
  state: (): BlockState => ({
    items: [],
    isLoading: false,
  }),
  actions: {
    async fetchBlocks(tagNames?: string[]) {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('block.list', { tagNames });
        const payload = (response ?? {}) as { items?: StepTemplate[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
    async createBlock(payload: CreateBlockPayload) {
      const response = (await window.api.invoke('block.create', {
        id: payload.id,
        title: payload.title,
        description: payload.description,
        block: payload.block,
        params: payload.params,
        tagNames: payload.tagNames,
      })) as { block?: StepTemplate };
      if (response?.block) {
        this.items = [response.block, ...this.items];
      }
      return response?.block;
    },
  },
});
