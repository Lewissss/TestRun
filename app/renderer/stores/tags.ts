import { defineStore } from 'pinia';
import type { Tag } from '@shared/types';

interface TagsState {
  items: Tag[];
  isLoading: boolean;
}

export const useTagsStore = defineStore('tags', {
  state: (): TagsState => ({
    items: [],
    isLoading: false,
  }),
  actions: {
    async fetchTags() {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('tag.list');
        const payload = (response ?? {}) as { items?: Tag[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
  },
});
