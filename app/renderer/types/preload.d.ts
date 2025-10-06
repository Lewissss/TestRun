declare global {
  interface Window {
    api: {
      invoke: (channel: string, payload?: unknown) => Promise<unknown>;
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
    };
  }
}

export {};
