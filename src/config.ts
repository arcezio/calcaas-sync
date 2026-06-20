import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface CalcaasConfig {
  apiKey: string;
  endpoint: string;
  deviceLabel: string;
  intervalMinutes: number;
}

// Default ingest endpoint — the Calcaas usage-ingest Edge Function (project ref
// matches supabaseClient.ts in the Calcaas app). Override per-device with --endpoint.
export const DEFAULT_ENDPOINT =
  'https://cfscgdfhtylxshkztrur.supabase.co/functions/v1/usage-ingest';

const CONFIG_DIR = path.join(os.homedir(), '.calcaas');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function configPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): Partial<CalcaasConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<CalcaasConfig>;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: CalcaasConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // mode 0o600 — the API key is a secret; keep it user-readable only.
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
