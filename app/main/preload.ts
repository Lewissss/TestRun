import { contextBridge, ipcRenderer } from 'electron';

type ApiBridge = {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
};

const apiBridge: ApiBridge = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(undefined, ...args);
    };
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
};

contextBridge.exposeInMainWorld('api', apiBridge);

declare global {
  interface Window {
    api: ApiBridge;
  }
}
