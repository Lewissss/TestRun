export class LlmDisabledError extends Error {
  public readonly code = 'LLM_DISABLED' as const;

  constructor(message = 'LLM features require a valid API key.') {
    super(message);
    this.name = 'LlmDisabledError';
  }
}

export class LlmRequestError extends Error {
  public readonly code = 'LLM_REQUEST_FAILED' as const;

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LlmRequestError';
  }
}
