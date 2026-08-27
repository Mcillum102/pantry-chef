import { readPersistedValue, writePersistedValue } from '@/services/persistence';

export type DiagnosticEntry = {
  id: string;
  level: 'error' | 'warning' | 'info';
  area: string;
  message: string;
  createdAt: string;
};

const diagnosticsKey = 'diagnostics-v1';

export async function recordDiagnostic(
  area: string,
  error: unknown,
  level: DiagnosticEntry['level'] = 'error'
) {
  const message = error instanceof Error ? error.message : String(error);
  const current = await readPersistedValue<DiagnosticEntry[]>(diagnosticsKey) ?? [];
  const entry: DiagnosticEntry = {
    id: `diagnostic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    level,
    area,
    message: message.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  await writePersistedValue(diagnosticsKey, [entry, ...current].slice(0, 50));
}

export async function readDiagnostics() {
  return await readPersistedValue<DiagnosticEntry[]>(diagnosticsKey) ?? [];
}

export async function clearDiagnostics() {
  await writePersistedValue<DiagnosticEntry[]>(diagnosticsKey, []);
}
