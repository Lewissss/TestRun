import { app } from 'electron';
import { join } from 'node:path';

export function getAppDataPath(): string {
  return join(app.getPath('userData'), 'appdata');
}

export function getArtifactsPath(recordingId: string): string {
  return join(getAppDataPath(), 'artifacts', recordingId);
}
