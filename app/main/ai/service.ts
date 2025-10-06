import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import {
  AiAssertionSuggestion,
  AiCompositionSuggestion,
  AiFailureTriage,
  AiSelectorSuggestion,
  AiSettings,
  AiSettingsState,
  AiStepLabel,
  AiTagSuggestion,
  AiVisualClassification,
  CompositionEntry,
  Expectation,
  RunSummaryDetail,
  Step,
} from '@shared/types';
import { LlmDisabledError, LlmRequestError } from './errors';
import { OpenUIClient } from './openuiClient';

const DEFAULT_SETTINGS: AiSettings = {
  baseUrl: 'http://localhost:11434',
  model: 'openui/gpt-4o-mini',
  temperature: 0.2,
  topP: 0.9,
  maxTokens: 512,
  enableCache: true,
};

interface PersistedSettings {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  enableCache?: boolean;
}

interface SelectorPayload {
  suggestions: Array<{ selector: string; confidence?: number; rationale?: string }>;
}

interface StepLabelPayload {
  steps: Array<{ stepId: string; label: string; summary: string }>;
}

interface TagSuggestionPayload {
  tags: Array<{ tag: string; confidence?: number; rationale?: string }>;
}

interface AssertionSuggestionPayload {
  assertions: Array<{ selector: string; operator: string; value?: string; description?: string }>;
}

interface CompositionPayload {
  title: string;
  description?: string;
  steps: CompositionEntry[];
}

interface FailureTriagePayload {
  summary: string;
  likelyCauses: string[];
  suggestedActions: string[];
}

interface VisualClassificationPayload {
  classification: AiVisualClassification['classification'];
  notes?: string;
}

export class AiService {
  private settings: AiSettings = { ...DEFAULT_SETTINGS };
  private apiKey?: string;
  private client: OpenUIClient;
  private initialized = false;

  constructor() {
    this.client = new OpenUIClient(() => this.settings, () => this.apiKey);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!app.isReady()) {
      await app.whenReady();
    }
    await Promise.all([this.loadSettingsFromDisk(), this.loadApiKeyFromDisk()]);
    this.initialized = true;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  getSettingsState(): AiSettingsState {
    return {
      ...this.settings,
      enabled: this.isEnabled(),
      hasKey: Boolean(this.apiKey),
    };
  }

  async updateSettings(partial: Partial<AiSettings>): Promise<AiSettingsState> {
    await this.init();
    this.settings = {
      ...this.settings,
      ...this.normalizeSettings(partial),
    };
    await this.persistSettings();
    return this.getSettingsState();
  }

  async setApiKey(key: string): Promise<AiSettingsState> {
    await this.init();
    const keyBuffer = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
    await mkdir(this.secureDir, { recursive: true, mode: 0o700 });
    await writeFile(this.apiKeyPath, keyBuffer.toString('base64'), { mode: 0o600 });
    this.apiKey = key;
    return this.getSettingsState();
  }

  async clearApiKey(): Promise<AiSettingsState> {
    await this.init();
    try {
      await rm(this.apiKeyPath, { force: true });
    } catch (error) {
      console.warn('Failed to remove stored API key', error);
    }
    this.apiKey = undefined;
    return this.getSettingsState();
  }

  async testConnection(): Promise<void> {
    await this.ensureEnabled();
    await this.client.testConnection();
  }

  async selectorRepair(step: Step, context?: { preceding?: Step[]; following?: Step[] }): Promise<AiSelectorSuggestion[]> {
    await this.ensureEnabled();
    const prompt = this.buildSelectorPrompt(step, context);
    try {
      const payload = await this.client.chatJson<SelectorPayload>({
        system: 'You infer Playwright selectors. Return JSON matching {"suggestions":[{ "selector": string, "confidence": number, "rationale"?: string }]}',
        prompt,
      });
      if (!payload?.suggestions?.length) {
        return this.fallbackSelectors(step);
      }
      return payload.suggestions.map((item) => ({
        stepId: step.id,
        selector: item.selector,
        confidence: item.confidence ?? 0.5,
        rationale: item.rationale,
      }));
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Selector repair fallback due to LLM failure', error);
        return this.fallbackSelectors(step);
      }
      throw error;
    }
  }

  async summarizeSteps(steps: Step[]): Promise<AiStepLabel[]> {
    await this.ensureEnabled();
    if (!steps.length) return [];
    const prompt = `Summarize these Playwright steps and provide friendly labels. Respond as JSON {"steps":[{"stepId":"id","label":"...","summary":"..."}]}. Steps: ${JSON.stringify(
      steps.map((step) => ({
        id: step.id,
        type: step.type,
        selector: step.selector,
        route: step.route,
        name: step.name,
      })),
    )}`;
    try {
      const payload = await this.client.chatJson<StepLabelPayload>({
        system: 'You summarize UI automation steps for humans.',
        prompt,
      });
      if (!payload?.steps?.length) {
        return this.fallbackLabels(steps);
      }
      return payload.steps.map((item) => ({
        stepId: item.stepId,
        label: item.label,
        summary: item.summary,
      }));
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Step summary fallback due to LLM failure', error);
        return this.fallbackLabels(steps);
      }
      throw error;
    }
  }

  async suggestTags(input: { name: string; description?: string | null; type: 'recording' | 'block' | 'test' | 'api'; existingTags?: string[]; stepSamples?: Step[] }): Promise<AiTagSuggestion[]> {
    await this.ensureEnabled();
    const prompt = this.buildTagPrompt(input);
    try {
      const payload = await this.client.chatJson<TagSuggestionPayload>({
        system: 'Suggest concise tags for Playwright assets. Output {"tags":[{"tag":"name","confidence":0-1,"rationale"?:string}]}',
        prompt,
      });
      if (!payload?.tags?.length) {
        return this.fallbackTags(input);
      }
      return payload.tags.map((item) => ({
        tag: item.tag,
        confidence: item.confidence ?? 0.6,
        rationale: item.rationale,
      }));
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Tag suggestion fallback due to LLM failure', error);
        return this.fallbackTags(input);
      }
      throw error;
    }
  }

  async suggestAssertions(context: { steps: Step[]; expectations?: Expectation[] }): Promise<AiAssertionSuggestion[]> {
    await this.ensureEnabled();
    const prompt = this.buildAssertionPrompt(context);
    try {
      const payload = await this.client.chatJson<AssertionSuggestionPayload>({
        system: 'Suggest Playwright assertions. Output {"assertions":[{"selector":string,"operator":string,"value"?:string,"description"?:string}]}',
        prompt,
        maxTokensOverride: 600,
      });
      if (!payload?.assertions?.length) {
        return this.fallbackAssertions(context);
      }
      return payload.assertions.map((item) => ({
        selector: item.selector,
        operator: this.normalizeOperator(item.operator),
        value: item.value,
        description: item.description,
      }));
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Assertion suggestion fallback due to LLM failure', error);
        return this.fallbackAssertions(context);
      }
      throw error;
    }
  }

  async naturalLanguageToComposition(payload: { instructions: string; availableBlocks: Array<{ id: string; title: string; kind: 'ui' | 'api'; params: string[] }>; baseUrl?: string }): Promise<AiCompositionSuggestion> {
    await this.ensureEnabled();
    const prompt = this.buildComposerPrompt(payload);
    try {
      const response = await this.client.chatJson<CompositionPayload>({
        system: 'Turn natural language testing instructions into Playwright block compositions.',
        prompt,
        maxTokensOverride: 900,
      });
      return {
        title: response.title,
        description: response.description,
        steps: response.steps ?? [],
      };
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Composer suggestion fallback due to LLM failure', error);
        return this.fallbackComposition(payload);
      }
      throw error;
    }
  }

  async failureTriage(context: { summary: RunSummaryDetail[]; logs?: string | null }): Promise<AiFailureTriage> {
    await this.ensureEnabled();
    const prompt = this.buildFailurePrompt(context);
    try {
      const response = await this.client.chatJson<FailureTriagePayload>({
        system: 'You triage Playwright test failures and return JSON {"summary":string,"likelyCauses":string[],"suggestedActions":string[]}.',
        prompt,
        maxTokensOverride: 700,
      });
      return {
        summary: response.summary,
        likelyCauses: response.likelyCauses ?? [],
        suggestedActions: response.suggestedActions ?? [],
      };
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Failure triage fallback due to LLM failure', error);
        return this.fallbackFailureTriage(context);
      }
      throw error;
    }
  }

  async classifyVisualDiff(context: { diffPath: string; metadata?: Record<string, unknown> | null }): Promise<AiVisualClassification> {
    await this.ensureEnabled();
    const prompt = this.buildVisualPrompt(context);
    try {
      const response = await this.client.chatJson<VisualClassificationPayload>({
        system: 'Classify screenshot diffs. Output {"classification":"layout|content|accessibility|flaky|unknown","notes"?:string}.',
        prompt,
        maxTokensOverride: 200,
      });
      return {
        classification: response.classification,
        notes: response.notes,
      };
    } catch (error) {
      if (error instanceof LlmRequestError) {
        console.warn('Visual classification fallback due to LLM failure', error);
        return {
          classification: 'unknown',
          notes: 'Unable to classify diff without LLM response.',
        };
      }
      throw error;
    }
  }

  private normalizeOperator(operator: string): 'equals' | 'contains' | 'exists' | 'notExists' {
    switch (operator.toLowerCase()) {
      case 'equals':
      case 'equal':
      case '==':
        return 'equals';
      case 'contains':
      case 'includes':
        return 'contains';
      case 'exists':
      case 'visible':
        return 'exists';
      case 'notexists':
      case 'missing':
      case 'not-exists':
        return 'notExists';
      default:
        return 'equals';
    }
  }

  private buildSelectorPrompt(step: Step, context?: { preceding?: Step[]; following?: Step[] }): string {
    return `Given this step from a Playwright recording, suggest up to 3 robust locator strategies. Respond with JSON. Step: ${JSON.stringify({
      id: step.id,
      type: step.type,
      selector: step.selector,
      role: step.role,
      name: step.name,
      testid: step.testid,
      route: step.route,
    })}. Preceding: ${JSON.stringify((context?.preceding ?? []).map((s) => ({ type: s.type, name: s.name })), null, 0)}.`;
  }

  private buildTagPrompt(input: { name: string; description?: string | null; type: string; existingTags?: string[]; stepSamples?: Step[] }): string {
    return `Suggest tags for a ${input.type}. Name: ${input.name}. Description: ${input.description ?? 'n/a'}. Existing tags: ${(input.existingTags ?? []).join(', ') || 'none'}. Sample steps: ${JSON.stringify(
      (input.stepSamples ?? []).slice(0, 3).map((step) => ({ type: step.type, selector: step.selector, name: step.name })),
    )}`;
  }

  private buildAssertionPrompt(context: { steps: Step[]; expectations?: Expectation[] }): string {
    return `Provide additional assertions for these steps. Existing assertions: ${JSON.stringify(context.expectations ?? [])}. Steps: ${JSON.stringify(
      context.steps.map((step) => ({ type: step.type, selector: step.selector, name: step.name, route: step.route })),
    )}`;
  }

  private buildComposerPrompt(payload: { instructions: string; availableBlocks: Array<{ id: string; title: string; kind: 'ui' | 'api'; params: string[] }>; baseUrl?: string }): string {
    return `Turn the instructions into a Playwright composition referencing these blocks when appropriate. Respond as JSON {"title":string,"description"?:string,"steps":CompositionEntry[]}. Instructions: ${payload.instructions}. Available blocks: ${JSON.stringify(
      payload.availableBlocks,
    )}. Base URL: ${payload.baseUrl ?? 'n/a'}`;
  }

  private buildFailurePrompt(context: { summary: RunSummaryDetail[]; logs?: string | null }): string {
    return `Analyse this Playwright run failure and return JSON. Steps: ${JSON.stringify(context.summary)}. Logs: ${context.logs?.slice(0, 2000) ?? 'n/a'}`;
  }

  private buildVisualPrompt(context: { diffPath: string; metadata?: Record<string, unknown> | null }): string {
    return `Classify a screenshot diff located at ${context.diffPath}. Additional metadata: ${JSON.stringify(context.metadata ?? {})}`;
  }

  private fallbackSelectors(step: Step): AiSelectorSuggestion[] {
    if (step.selector) {
      return [
        {
          stepId: step.id,
          selector: step.selector,
          confidence: 0.4,
          rationale: 'Reused existing selector as fallback.',
        },
      ];
    }
    if (step.testid) {
      return [
        {
          stepId: step.id,
          selector: `data-testid=${step.testid}`,
          confidence: 0.3,
          rationale: 'Generated from data-testid attribute.',
        },
      ];
    }
    if (step.name) {
      return [
        {
          stepId: step.id,
          selector: `role=${step.role ?? 'button'}[name="${step.name}"]`,
          confidence: 0.25,
          rationale: 'Fallback using role and accessible name.',
        },
      ];
    }
    return [
      {
        stepId: step.id,
        selector: 'TODO: define selector',
        confidence: 0.1,
        rationale: 'No selector data available.',
      },
    ];
  }

  private fallbackLabels(steps: Step[]): AiStepLabel[] {
    return steps.map((step) => ({
      stepId: step.id,
      label: `${step.type.toUpperCase()} step`,
      summary: step.name ? `Interact with ${step.name}` : `Perform ${step.type} action`,
    }));
  }

  private fallbackTags(input: { name: string; type: string }): AiTagSuggestion[] {
    const base = input.name.toLowerCase().split(/\s+/).slice(0, 2).join('-');
    return [
      {
        tag: `${input.type}-${base || 'auto'}`,
        confidence: 0.3,
        rationale: 'Fallback generated tag.',
      },
    ];
  }

  private fallbackAssertions(context: { steps: Step[] }): AiAssertionSuggestion[] {
    const lastInteractive = [...context.steps].reverse().find((step) => step.type === 'click' || step.type === 'submit');
    if (lastInteractive?.selector) {
      return [
        {
          selector: lastInteractive.selector,
          operator: 'exists',
          description: 'Ensure the interacted element remains visible.',
        },
      ];
    }
    return [];
  }

  private fallbackComposition(payload: { instructions: string }): AiCompositionSuggestion {
    return {
      title: payload.instructions.slice(0, 60) || 'AI Authored Test',
      description: 'Fallback composition created without LLM output.',
      steps: [],
    };
  }

  private fallbackFailureTriage(context: { summary: RunSummaryDetail[] }): AiFailureTriage {
    const failed = context.summary.filter((item) => item.status !== 'passed');
    return {
      summary: failed.length ? `${failed.length} steps reported issues.` : 'No failing steps detected.',
      likelyCauses: failed.map((item) => `${item.title}: ${item.error ?? 'Unknown error'}`),
      suggestedActions: ['Review failing step logs', 'Re-run test with tracing enabled'],
    };
  }

  private normalizeSettings(partial: Partial<AiSettings>): AiSettings {
    const normalized: AiSettings = { ...this.settings };
    if (partial.baseUrl) normalized.baseUrl = partial.baseUrl.trim();
    if (partial.model) normalized.model = partial.model.trim();
    if (typeof partial.temperature === 'number') normalized.temperature = Math.min(Math.max(partial.temperature, 0), 2);
    if (typeof partial.topP === 'number') normalized.topP = Math.min(Math.max(partial.topP, 0), 1);
    if (typeof partial.maxTokens === 'number') normalized.maxTokens = Math.max(64, Math.min(partial.maxTokens, 4096));
    if (typeof partial.enableCache === 'boolean') normalized.enableCache = partial.enableCache;
    return normalized;
  }

  private async loadSettingsFromDisk(): Promise<void> {
    try {
      await access(this.configPath, constants.F_OK);
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
      return;
    }
    try {
      const raw = await readFile(this.configPath, 'utf8');
      const data = JSON.parse(raw) as PersistedSettings;
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...this.normalizeSettings(data as AiSettings),
      };
    } catch (error) {
      console.warn('Failed to load AI settings, using defaults', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private async persistSettings(): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const payload: PersistedSettings = {
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      temperature: this.settings.temperature,
      topP: this.settings.topP,
      maxTokens: this.settings.maxTokens,
      enableCache: this.settings.enableCache,
    };
    await writeFile(this.configPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  private async loadApiKeyFromDisk(): Promise<void> {
    try {
      await access(this.apiKeyPath, constants.F_OK);
    } catch {
      this.apiKey = undefined;
      return;
    }
    try {
      const raw = await readFile(this.apiKeyPath, 'utf8');
      const buffer = Buffer.from(raw, 'base64');
      this.apiKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buffer) : buffer.toString('utf8');
    } catch (error) {
      console.warn('Failed to decode stored API key; clearing it.', error);
      this.apiKey = undefined;
      await rm(this.apiKeyPath, { force: true });
    }
  }

  private async ensureEnabled(): Promise<void> {
    await this.init();
    if (!this.isEnabled()) {
      throw new LlmDisabledError();
    }
  }

  private get configDir(): string {
    return join(app.getPath('userData'), 'config');
  }

  private get configPath(): string {
    return join(this.configDir, 'ai.json');
  }

  private get secureDir(): string {
    return join(app.getPath('userData'), 'secure');
  }

  private get apiKeyPath(): string {
    return join(this.secureDir, 'openui.key');
  }
}

export const aiService = new AiService();
void aiService.init().catch((error) => console.warn('Failed to initialize AI service', error));
