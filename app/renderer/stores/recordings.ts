import { defineStore } from 'pinia';
import type { Recording } from '@shared/types';

interface RecordingState {
  items: Recording[];
  isLoading: boolean;
  activeRecordingId: string | null;
  activeRecorderSessionId: string | null;
  lastRecorderArtifacts: { sessionId: string; tracePath?: string; flowLogPath?: string } | null;
}

export const useRecordingsStore = defineStore('recordings', {
  state: (): RecordingState => ({
    items: [],
    isLoading: false,
    activeRecordingId: null,
    activeRecorderSessionId: null,
    lastRecorderArtifacts: null,
  }),
  getters: {
    activeRecording(state): Recording | undefined {
      return state.items.find((item) => item.id === state.activeRecordingId);
    },
  },
  actions: {
    async fetchRecordings() {
      this.isLoading = true;
      try {
        const response = await window.api.invoke('recording.list');
        const payload = (response ?? {}) as { items?: Recording[] };
        this.items = payload.items ?? [];
      } finally {
        this.isLoading = false;
      }
    },
    setActive(id: string | null) {
      this.activeRecordingId = id;
    },
    updateStep(stepId: string, patch: Partial<Recording['steps'][number]>) {
      const recording = this.activeRecording;
      if (!recording) return;
      const target = recording.steps.find((step) => step.id === stepId);
      if (target) {
        Object.assign(target, patch);
      }
    },
    async startRecorder(options: { baseUrl?: string; viewport?: { width: number; height: number; deviceScaleFactor?: number } }) {
      const response = (await window.api.invoke('recording.start', options)) as
        | { sessionId: string; tracePath?: string; flowLogPath?: string }
        | undefined;
      if (!response?.sessionId) {
        throw new Error('Failed to start recording session.');
      }
      this.activeRecorderSessionId = response.sessionId;
      this.lastRecorderArtifacts = null;
      return response;
    },
    async stopRecorder() {
      if (!this.activeRecorderSessionId) return null;
      const response = (await window.api.invoke('recording.stop', {
        sessionId: this.activeRecorderSessionId,
      })) as { sessionId: string; stopped: boolean; tracePath?: string; flowLogPath?: string; recordingId?: string };
      if (response?.stopped) {
        this.lastRecorderArtifacts = {
          sessionId: response.sessionId,
          tracePath: response.tracePath,
          flowLogPath: response.flowLogPath,
        };
        this.activeRecorderSessionId = null;
        await this.fetchRecordings();
      }
      return response;
    },
  },
});
