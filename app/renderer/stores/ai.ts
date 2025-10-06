import { defineStore } from 'pinia';
import type { AiSettings, AiSettingsState } from '@shared/types';

const DEFAULT_SETTINGS: AiSettingsState = {
  baseUrl: 'http://localhost:11434',
  model: 'openui/gpt-4o-mini',
  temperature: 0.2,
  topP: 0.9,
  maxTokens: 512,
  enableCache: true,
  enabled: false,
  hasKey: false,
};

interface AiState {
  settings: AiSettingsState;
  isLoading: boolean;
  isTesting: boolean;
  lastTestResult?: { ok: boolean; message?: string };
}

export const useAiStore = defineStore('ai', {
  state: (): AiState => ({
    settings: { ...DEFAULT_SETTINGS },
    isLoading: false,
    isTesting: false,
    lastTestResult: undefined,
  }),
  getters: {
    enabled(state): boolean {
      return state.settings.enabled;
    },
    hasKey(state): boolean {
      return state.settings.hasKey;
    },
  },
  actions: {
    async fetchSettings() {
      this.isLoading = true;
      try {
        const response = (await window.api.invoke('ai.settings.get')) as { settings?: AiSettingsState } | undefined;
        if (response?.settings) {
          this.settings = response.settings;
        } else {
          this.settings = { ...DEFAULT_SETTINGS };
        }
      } finally {
        this.isLoading = false;
      }
    },
    async updateSettings(partial: Partial<AiSettings>) {
      const response = (await window.api.invoke('ai.settings.update', partial)) as { settings?: AiSettingsState } | undefined;
      if (response?.settings) {
        this.settings = response.settings;
      }
    },
    async setApiKey(apiKey: string) {
      const response = (await window.api.invoke('ai.settings.setKey', { apiKey })) as { settings?: AiSettingsState } | undefined;
      if (response?.settings) {
        this.settings = response.settings;
      }
    },
    async clearApiKey() {
      const response = (await window.api.invoke('ai.settings.clearKey')) as { settings?: AiSettingsState } | undefined;
      if (response?.settings) {
        this.settings = response.settings;
      }
    },
    async testConnection() {
      this.isTesting = true;
      try {
        const response = (await window.api.invoke('ai.settings.test')) as { ok?: boolean; error?: string; message?: string } | undefined;
        const ok = Boolean(response?.ok);
        this.lastTestResult = {
          ok,
          message: response?.message ?? (ok ? 'Connection succeeded.' : response?.error ?? 'Connection failed.'),
        };
        if (!ok && response?.error === 'LLM_DISABLED') {
          this.settings = { ...this.settings, enabled: false };
        }
        return this.lastTestResult;
      } finally {
        this.isTesting = false;
      }
    },
  },
});
