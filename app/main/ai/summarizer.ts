import { Step } from '@shared/types';

export interface SummaryOptions {
  steps: Step[];
  maxLength?: number;
}

export function summarizeRecording({ steps, maxLength = 280 }: SummaryOptions): string {
  const actions = steps
    .slice(0, 10)
    .map((step) => `${step.index + 1}. ${step.type}${step.name ? ` → ${step.name}` : ''}`)
    .join(' | ');
  const base = `Recording with ${steps.length} steps: ${actions}`;
  return base.length > maxLength ? `${base.slice(0, maxLength - 3)}...` : base;
}
