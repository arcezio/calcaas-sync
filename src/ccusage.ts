import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// We invoke the bundled ccusage binary via `node <bin> daily --json` rather than
// importing its programmatic API — spawning the CLI is stable across ccusage
// majors, whereas its internal data-loader surface is not a documented contract.
// ccusage is a hard dependency, so it always resolves from our own node_modules.

const require = createRequire(import.meta.url);

function resolveCcusageBin(): string {
  const pkgJsonPath = require.resolve('ccusage/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.ccusage;
  if (!rel) {
    throw new Error('Could not locate the ccusage binary (package.json "bin" missing).');
  }
  return path.join(path.dirname(pkgJsonPath), rel);
}

export interface FetchDailyOptions {
  /** Inclusive lower bound as YYYY-MM-DD (converted to ccusage's YYYYMMDD). */
  since?: string;
  /** ccusage agent subcommand (e.g. 'claude', 'codex'). Omit for the cross-tool aggregate. */
  tool?: string;
}

function toCompactDate(d: string): string {
  return d.replace(/-/g, '');
}

export async function fetchDailyRaw(options: FetchDailyOptions = {}): Promise<unknown> {
  const bin = resolveCcusageBin();
  // `<agent> daily --json` for a specific tool; bare `daily --json` for the
  // cross-tool aggregate (used only to detect which agents have data).
  const args = options.tool ? [bin, options.tool, 'daily', '--json'] : [bin, 'daily', '--json'];
  if (options.since) args.push('--since', toCompactDate(options.since));
  return runJson(process.execPath, args);
}

function runJson(cmd: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ccusage exited with code ${code}: ${err.trim() || out.trim() || '(no output)'}`));
        return;
      }
      try {
        resolve(JSON.parse(stripToJson(out)));
      } catch (e) {
        reject(new Error(`Failed to parse ccusage JSON output: ${(e as Error).message}`));
      }
    });
  });
}

// --json prints pure JSON, but guard against any leading banner / warning lines.
function stripToJson(s: string): string {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  return start >= 0 && end > start ? s.slice(start, end + 1) : s;
}
