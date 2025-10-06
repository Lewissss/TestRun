import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { format } from 'date-fns';
import { compile } from 'handlebars';
import type { BlockAction } from '@shared/types';
import fs from 'node:fs/promises';

interface BlockTemplateData {
  id: string;
  title: string;
  version: number;
  block: unknown;
  params: Array<{
    name: string;
    label?: string | null;
    type: string;
    required: boolean;
    defaultValue?: string | null;
    enumValues?: string | null;
  }>;
}

interface ApiBlockTemplateData {
  id: string;
  title: string;
  version: number;
  actions: unknown;
  params: Array<{
    name: string;
    label?: string | null;
    type: string;
    required: boolean;
    defaultValue?: string | null;
    enumValues?: string | null;
  }>;
}

export interface GenerateBlockOptions {
  template: BlockTemplateData;
  outputDir: string;
}

export interface GenerateBlockResult {
  filePath: string;
  functionName: string;
}

export interface TestEntryContext {
  kind: 'ui' | 'api';
  title: string;
  functionName: string;
  importPath: string;
  bindingsLiteral: string;
  isApi: boolean;
}

export interface GenerateTestOptions {
  testId: string;
  title: string;
  baseUrl: string;
  viewport: { width: number; height: number; scale?: number };
  entries: TestEntryContext[];
  snapshotDir: string;
  outputFile: string;
  datasetLiteral?: string;
  environmentLiteral?: string;
  hasUiEntries: boolean;
  hasApiEntries: boolean;
}

function toPascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toSafeFileBase(template: BlockTemplateData): string {
  return `${template.id}-v${template.version}`;
}

function toSafeApiFileBase(template: ApiBlockTemplateData): string {
  return `api-${template.id}-v${template.version}`;
}

function mapParamType(type: string): string {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function actionStatements(action: BlockAction): string[] {
  const statements: string[] = [];
  switch (action.action) {
    case 'route':
      statements.push(`await page.goto('${action.route ?? ''}');`);
      break;
    case 'click':
      statements.push(`await page.locator('${action.selector ?? ''}').click();`);
      break;
    case 'type': {
      const key = action.value ?? 'value';
      statements.push(`await page.locator('${action.selector ?? ''}').fill(params['${key}'] ?? '');`);
      break;
    }
    case 'submit':
      statements.push(`await page.locator('${action.selector ?? ''}').press('Enter');`);
      break;
    case 'assert':
      statements.push(`await expect(page.locator('${action.selector ?? ''}')).toBeVisible();`);
      break;
    default:
      statements.push('// TODO: Unsupported action');
      break;
  }

  if (action.screenshot) {
    statements.push(`await expect(page).toHaveScreenshot('${action.screenshot}');`);
  }

  return statements;
}

export async function generateBlockModule({ template, outputDir }: GenerateBlockOptions): Promise<GenerateBlockResult> {
  await mkdir(outputDir, { recursive: true });
  const templatePath = join(process.cwd(), 'app/shared/codegenTemplates/block.ts.hbs');
  const templateSource = await fs.readFile(templatePath, 'utf8');
  const render = compile<{
    functionName: string;
    params: Array<{ name: string; type: string; required: boolean }>;
    statements: string[];
  }>(templateSource);

  const functionName = toPascalCase(`${template.title} v${template.version}`);
  const params = template.params.map((param) => ({ name: param.name, type: mapParamType(param.type), required: param.required }));
  const blockActions = Array.isArray(template.block) ? (template.block as BlockAction[]) : [];
  const statements = blockActions.flatMap((action) => actionStatements(action));

  const moduleContent = render({ functionName, params, statements });

  const fileBase = toSafeFileBase(template);
  const destination = join(outputDir, `${fileBase}.ts`);
  await writeFile(destination, moduleContent, 'utf8');

  return { filePath: destination, functionName };
}

export async function generateApiBlockModule({ template, outputDir }: { template: ApiBlockTemplateData; outputDir: string }): Promise<GenerateBlockResult> {
  await mkdir(outputDir, { recursive: true });
  const templatePath = join(process.cwd(), 'app/shared/codegenTemplates/apiBlock.ts.hbs');
  const templateSource = await fs.readFile(templatePath, 'utf8');
  const render = compile<{
    functionName: string;
    params: Array<{ name: string; type: string; required: boolean }>;
    actionsLiteral: string;
  }>(templateSource);

  const functionName = toPascalCase(`${template.title} Api v${template.version}`);
  const params = template.params.map((param) => ({ name: param.name, type: mapParamType(param.type), required: param.required }));
  const actionsLiteral = JSON.stringify(template.actions ?? [], null, 2).replace(/\n/g, '\n    ');

  const moduleContent = render({ functionName, params, actionsLiteral });

  const fileBase = toSafeApiFileBase(template);
  const destination = join(outputDir, `${fileBase}.ts`);
  await writeFile(destination, moduleContent, 'utf8');

  return { filePath: destination, functionName };
}

export async function generateTestSpec(options: GenerateTestOptions): Promise<string> {
  const templatePath = join(process.cwd(), 'app/shared/codegenTemplates/test.ts.hbs');
  const templateSource = await fs.readFile(templatePath, 'utf8');
  const render = compile<{
    testId: string;
    title: string;
    createdAt: string;
    baseUrl: string;
    viewport: { width: number; height: number; scale?: number };
    snapshotDir: string;
    entries: TestEntryContext[];
    datasetLiteral?: string;
    environmentLiteral?: string;
    hasUiEntries: boolean;
    hasApiEntries: boolean;
  }>(templateSource);

  const content = render({
    testId: options.testId,
    title: options.title,
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
    baseUrl: options.baseUrl,
    viewport: options.viewport,
    snapshotDir: options.snapshotDir,
    entries: options.entries,
    datasetLiteral: options.datasetLiteral,
    environmentLiteral: options.environmentLiteral,
    hasUiEntries: options.hasUiEntries,
    hasApiEntries: options.hasApiEntries,
  });

  await mkdir(dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, content, 'utf8');
  return options.outputFile;
}

export async function copyBaselineScreenshots(baselineDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(baselineDir);
  await Promise.all(
    entries.map((entry) => {
      const input = join(baselineDir, entry);
      const output = join(targetDir, entry);
      return copyFile(input, output);
    }),
  );
}
