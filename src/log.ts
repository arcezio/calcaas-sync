import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every line also appends to this file, so the autostart watcher (which runs with
// no visible window) is still debuggable. Best-effort — file errors never throw.
const LOG_FILE = path.join(os.homedir(), '.calcaas', 'calcaas-sync.log');

export function logPath(): string {
  return LOG_FILE;
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function emit(stream: NodeJS.WriteStream, prefix: string, msg: string): void {
  const line = `[${ts()}] ${prefix}${msg}\n`;
  stream.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore — logging must never break the process
  }
}

export function log(msg: string): void {
  emit(process.stdout, '', msg);
}

export function error(msg: string): void {
  emit(process.stderr, 'ERROR ', msg);
}
