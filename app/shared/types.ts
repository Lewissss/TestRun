export type StepType = 'route' | 'click' | 'submit' | 'type' | 'assert';

export interface Recording {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  baseUrl: string;
  viewportW: number;
  viewportH: number;
  scale: number;
  traceZipPath: string;
  flowLogPath: string;
  steps: Step[];
  tags: Tag[];
}

export interface Step {
  id: string;
  recordingId: string;
  index: number;
  type: StepType;
  route?: string | null;
  selector?: string | null;
  role?: string | null;
  name?: string | null;
  testid?: string | null;
  apiHints?: Record<string, unknown> | null;
  screenshot: string;
  customName?: string | null;
  deleted: boolean;
  paramHints?: Array<ParameterHint> | null;
}

export interface ParameterHint {
  kind: 'text' | 'number' | 'boolean' | 'enum' | 'secret';
  fieldLabel: string;
  selector: string;
  mask?: boolean;
  inferredName?: string;
}

export interface StepTemplate {
  id: string;
  title: string;
  description?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  block: BlockAction[];
  params: BlockParam[];
  tags: Tag[];
}

export type BlockAction = {
  action: 'click' | 'type' | 'submit' | 'route' | 'assert';
  selector?: string;
  role?: string;
  name?: string;
  route?: string;
  screenshot?: string;
  value?: string;
  options?: Record<string, unknown>;
};

export interface BlockParam {
  id: string;
  stepTemplateId?: string | null;
  apiBlockId?: string | null;
  name: string;
  label?: string | null;
  type: ParamType;
  required: boolean;
  defaultValue?: string | null;
  enumValues?: string | null;
}

export type ParamType = 'string' | 'number' | 'boolean' | 'enum' | 'secret';

export interface TestCase {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  composition: CompositionEntry[];
  snapshotDir: string;
  tags: Tag[];
  environmentId?: string | null;
  environment?: Environment | null;
}

export type CompositionEntry = UiCompositionEntry | ApiCompositionEntry;

export interface UiCompositionEntry {
  kind: 'ui';
  blockId: string;
  version: number;
  bindings: Record<string, BindingValue>;
  expectations?: Expectation[];
}

export interface ApiCompositionEntry {
  kind: 'api';
  blockId: string;
  version: number;
  bindings: Record<string, BindingValue>;
}

export type BindingValue =
  | string
  | { type: 'env'; key: string }
  | { type: 'secret'; key: string }
  | { type: 'rand'; format: 'hex8' | 'int'; min?: number; max?: number }
  | { type: 'data'; key: string };

export interface DataSet {
  id: string;
  name: string;
  description?: string | null;
  bindings: Record<string, string>;
  tags: Tag[];
}

export interface Tag {
  id: string;
  name: string;
}

export interface ApiSession {
  id: string;
  name: string;
  description?: string | null;
  baseUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  requests: ApiRequest[];
  tags: Tag[];
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiRequest {
  id: string;
  apiSessionId: string;
  name: string;
  method: ApiMethod;
  url: string;
  headers?: Record<string, string> | null;
  query?: Record<string, unknown> | null;
  bodyMode?: 'json' | 'text' | 'form' | 'multipart' | null;
  body?: string | null;
  auth?: Record<string, unknown> | null;
  preScripts?: string | null;
  postScripts?: string | null;
  lastStatus?: number | null;
  lastLatencyMs?: number | null;
  lastRespHeaders?: Record<string, unknown> | null;
  lastRespBody?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiBlock {
  id: string;
  title: string;
  description?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  actions: ApiBlockAction[];
  params: BlockParam[];
  tags: Tag[];
}

export interface ApiBlockAction {
  method: ApiMethod;
  url: string;
  headers?: Record<string, string> | null;
  query?: Record<string, unknown> | null;
  bodyMode?: 'json' | 'text' | 'form' | 'multipart' | null;
  body?: unknown;
  auth?: Record<string, unknown> | null;
  assertions?: ApiAssertion[];
  captures?: ApiCapture[];
  preScript?: string | null;
  postScript?: string | null;
}

export type ApiAssertion =
  | { type: 'status'; operator: 'equals' | 'between' | 'lt' | 'lte' | 'gt' | 'gte'; value: number | [number, number] }
  | { type: 'header'; name: string; operator: 'equals' | 'contains' | 'matches'; value: string }
  | { type: 'jsonPath'; path: string; operator: 'equals' | 'contains' | 'exists' | 'notExists' | 'length'; value?: unknown }
  | { type: 'bodyText'; operator: 'equals' | 'contains' | 'matches'; value: string }
  | { type: 'schema'; schema: string };

export interface ApiCapture {
  name: string;
  expression: string;
  source: 'jsonPath' | 'header' | 'bodyText';
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, unknown>;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunResultSummary {
  id: string;
  testId: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  startedAt: string;
  completedAt?: string;
  summaryPath?: string;
  diffArtifacts?: string[];
  logPath?: string;
  summaryJsonPath?: string;
}

export interface RunnerAttachment {
  name: string;
  path?: string;
  contentType?: string;
  body?: string;
  previewDataUrl?: string;
}

export interface RunSummaryDetail {
  title: string;
  status: string;
  duration?: number;
  error?: string;
  attachments?: RunnerAttachment[];
}

export interface Expectation {
  id: string;
  type: 'assert';
  operator: 'equals' | 'contains' | 'exists' | 'notExists';
  selector: string;
  value?: string;
}

export interface AiSettings {
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  enableCache: boolean;
}

export interface AiSettingsState extends AiSettings {
  enabled: boolean;
  hasKey: boolean;
}

export interface AiSelectorSuggestion {
  stepId: string;
  selector: string;
  confidence: number;
  rationale?: string;
}

export interface AiStepLabel {
  stepId: string;
  label: string;
  summary: string;
}

export interface AiTagSuggestion {
  tag: string;
  confidence: number;
  rationale?: string;
}

export interface AiAssertionSuggestion {
  selector: string;
  operator: 'equals' | 'contains' | 'exists' | 'notExists';
  value?: string;
  description?: string;
}

export interface AiCompositionSuggestion {
  title: string;
  description?: string;
  steps: CompositionEntry[];
}

export interface AiFailureTriage {
  summary: string;
  likelyCauses: string[];
  suggestedActions: string[];
}

export interface AiVisualClassification {
  classification: 'layout' | 'content' | 'accessibility' | 'flaky' | 'unknown';
  notes?: string;
}
