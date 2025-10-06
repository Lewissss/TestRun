import { defineStore } from 'pinia';
import type { Environment } from '@shared/types';

interface EnvironmentState {
  items: Environment[];
  isLoading: boolean;
}

export interface SaveEnvironmentPayload {
  id?: string;
  name: string;
  description?: string | null;
  variables: Record<string, unknown>;
}

export const useEnvironmentsStore = defineStore('environments', {
  state: (): EnvironmentState => ({
    items: [],
    isLoading: false,
  }),
  actions: {
    async fetchEnvironments() {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('env.list', {});
        const payload = (response ?? {}) as { items?: Environment[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
    async saveEnvironment(payload: SaveEnvironmentPayload) {
      const response = await window.api.invoke('env.upsert', payload);
      await this.fetchEnvironments();
      return response as { environmentId: string };
    },
    async deleteEnvironment(environmentId: string) {
      await window.api.invoke('env.delete', { environmentId });
      await this.fetchEnvironments();
    },
  },
});
