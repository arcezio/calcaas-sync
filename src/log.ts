// Tiny timestamped logger — no dependencies.

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function log(msg: string): void {
  process.stdout.write(`[${ts()}] ${msg}\n`);
}

export function error(msg: string): void {
  process.stderr.write(`[${ts()}] ERROR ${msg}\n`);
}
