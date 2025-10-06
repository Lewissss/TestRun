import { AiSettings } from '@shared/types';
import { LlmDisabledError, LlmRequestError } from './errors';

interface ChatRequestOptions {
  prompt: string;
  system?: string;
  responseFormat?: 'json_object' | 'text';
  maxTokensOverride?: number;
  timeoutMs?: number;
}

interface ChatResponsePayload {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenUIClient {
  constructor(private readonly getSettings: () => AiSettings, private readonly getApiKey: () => string | undefined) {}

  isEnabled(): boolean {
    return Boolean(this.getApiKey());
  }

  async chat(options: ChatRequestOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new LlmDisabledError();
    }

    const settings = this.getSettings();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);
    try {
      const response = await fetch(new URL('/v1/chat/completions', settings.baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: this.buildMessages(options),
          temperature: settings.temperature,
          top_p: settings.topP,
          max_tokens: options.maxTokensOverride ?? settings.maxTokens,
          stream: false,
          cache: settings.enableCache ?? false,
          response_format: options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '<no-body>');
        throw new LlmRequestError(`OpenUI request failed with status ${response.status}`, text);
      }

      const payload = (await response.json()) as ChatResponsePayload;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new LlmRequestError('OpenUI response did not include content.');
      }
      return content;
    } catch (error) {
      if (error instanceof LlmDisabledError) throw error;
      if (error instanceof LlmRequestError) throw error;
      if ((error as Error)?.name === 'AbortError') {
        throw new LlmRequestError('OpenUI request timed out.', error);
      }
      throw new LlmRequestError('OpenUI request failed.', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatJson<T>(options: ChatRequestOptions): Promise<T> {
    const raw = await this.chat({ ...options, responseFormat: 'json_object' });
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      throw new LlmRequestError('Failed to parse JSON from OpenUI response.', error);
    }
  }

  async testConnection(): Promise<void> {
    const output = await this.chat({
      system: 'You are a connection tester. Reply with the single word OK.',
      prompt: 'Respond with OK.',
      timeoutMs: 8000,
      maxTokensOverride: 8,
    });
    if (!/^ok\b/i.test(output.trim())) {
      throw new LlmRequestError('OpenUI test response was unexpected.');
    }
  }

  private buildMessages(options: ChatRequestOptions) {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: options.prompt });
    return messages;
  }
}
