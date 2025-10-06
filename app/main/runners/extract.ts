import { mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import JSZip from 'jszip';
import fs from 'node:fs/promises';

export interface ExtractionOptions {
  traceZipPath: string;
  recordingId: string;
  targetDir: string;
}

export async function extractScreenshots({ traceZipPath, recordingId, targetDir }: ExtractionOptions): Promise<string[]> {
  const zip = new JSZip();
  const buffer = await fs.readFile(traceZipPath);
  const archive = await zip.loadAsync(buffer);
  const outputDir = join(targetDir, recordingId);
  await mkdir(outputDir, { recursive: true });

  const screenshots: string[] = [];
  const tasks: Promise<void>[] = [];

  archive.forEach((relativePath, file) => {
    if (!relativePath.startsWith('resources/')) return;
    const lower = relativePath.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) return;

    const filename = basename(relativePath).replace(/\.(jpeg)$/i, '.jpg');
    const destination = join(outputDir, filename);
    tasks.push(
      file
        .async('nodebuffer')
        .then((content) => fs.writeFile(destination, content))
        .then(() => {
          screenshots.push(destination);
        }),
    );
  });

  await Promise.all(tasks);
  return screenshots;
}
