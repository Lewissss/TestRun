import { defineStore } from 'pinia';
import type { ApiSession, ApiRequest } from '@shared/types';

interface ApiSessionsState {
  sessions: ApiSession[];
  isLoading: boolean;
  activeSessionId: string | null;
  activeRequestId: string | null;
}

export interface SaveApiSessionPayload {
  id?: string;
  name: string;
  description?: string | null;
  baseUrl?: string | null;
  tagNames?: string[];
}

export interface SaveApiRequestPayload {
  id?: string;
  apiSessionId: string;
  name: string;
  method: string;
  url: string;
  headers?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  bodyMode?: string | null;
  body?: string | null;
  auth?: Record<string, unknown> | null;
  preScripts?: string | null;
  postScripts?: string | null;
  assertions?: unknown[];
}

export interface SendApiRequestOptions {
  apiRequestId: string;
  environmentId?: string | null;
  bindings?: Record<string, unknown>;
}

export interface ApiExecutionResult {
  status: number;
  latencyMs: number;
  headers: Record<string, string>;
  bodyPath?: string;
  bodyText?: string;
  size?: number;
  captures?: Record<string, unknown>;
  logs?: string[];
  errorMessage?: string;
}

export const useApiSessionsStore = defineStore('apiSessions', {
  state: (): ApiSessionsState => ({
    sessions: [],
    isLoading: false,
    activeSessionId: null,
    activeRequestId: null,
  }),
  getters: {
    activeSession(state): ApiSession | undefined {
      return state.sessions.find((session) => session.id === state.activeSessionId);
    },
    activeRequest(state): ApiRequest | undefined {
      const session = state.sessions.find((item) => item.id === state.activeSessionId);
      if (!session) return undefined;
      return session.requests.find((request) => request.id === state.activeRequestId);
    },
  },
  actions: {
    async fetchSessions(tagNames?: string[]) {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('api.session.list', { tagNames });
        const payload = (response ?? {}) as { items?: ApiSession[] };
        this.sessions = payload.items ?? [];
        if (!this.activeSessionId && this.sessions.length) {
          this.activeSessionId = this.sessions[0].id;
        }
        if (this.activeSessionId) {
          const session = this.sessions.find((item) => item.id === this.activeSessionId);
          if (session && session.requests.length && !this.activeRequestId) {
            this.activeRequestId = session.requests[0].id;
          }
        }
      } finally {
        this.isLoading = false;
      }
    },
    selectSession(id: string | null) {
      this.activeSessionId = id;
      if (id) {
        const session = this.sessions.find((item) => item.id === id);
        this.activeRequestId = session?.requests[0]?.id ?? null;
      } else {
        this.activeRequestId = null;
      }
    },
    selectRequest(id: string | null) {
      this.activeRequestId = id;
    },
    async saveSession(payload: SaveApiSessionPayload) {
      const response = await window.api.invoke('api.session.save', payload);
      void this.fetchSessions();
      return response as { sessionId: string };
    },
    async deleteSession(sessionId: string) {
      await window.api.invoke('api.session.delete', { sessionId });
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
        this.activeRequestId = null;
      }
      await this.fetchSessions();
    },
    async saveRequest(payload: SaveApiRequestPayload) {
      const response = await window.api.invoke('api.request.save', payload);
      await this.fetchSessions();
      return response as { apiRequestId: string };
    },
    async deleteRequest(apiRequestId: string) {
      await window.api.invoke('api.request.delete', { apiRequestId });
      if (this.activeRequestId === apiRequestId) {
        this.activeRequestId = null;
      }
      await this.fetchSessions();
    },
    async sendRequest(options: SendApiRequestOptions) {
      const response = await window.api.invoke('api.request.send', options);
      return response as ApiExecutionResult;
    },
  },
});
