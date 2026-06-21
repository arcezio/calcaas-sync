#!/usr/bin/env node
import os from 'node:os';
import * as readline from 'node:readline';
import { loadConfig, saveConfig, configPath, DEFAULT_ENDPOINT, } from './config.js';
import { fetchDailyRaw } from './ccusage.js';
import { normalizeCcusageDaily } from './normalize.js';
import { pushRecords } from './api.js';
import { detectAgents, toolLabel, SUPPORTED_AGENTS } from './agents.js';
import { log, error as logError, logPath } from './log.js';
import { enableAutostart, disableAutostart, autostartTarget, startWatchDetached, } from './autostart.js';
import fs from 'node:fs';
function parseArgs(argv) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            }
            else {
                flags[key] = true;
            }
        }
        else {
            positionals.push(a);
        }
    }
    return { cmd: positionals[0] ?? 'help', flags };
}
const str = (f, k) => typeof f[k] === 'string' ? f[k] : undefined;
function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
    }));
}
function requireConfig() {
    const c = loadConfig();
    if (!c.apiKey || !c.endpoint || !c.deviceLabel) {
        logError('Not configured yet. Run `calcaas-sync login` first.');
        process.exit(1);
    }
    return {
        apiKey: c.apiKey,
        endpoint: c.endpoint,
        deviceLabel: c.deviceLabel,
        intervalMinutes: c.intervalMinutes ?? 60,
    };
}
async function cmdLogin(flags) {
    const existing = loadConfig();
    const apiKey = str(flags, 'key') || (await prompt('Paste your Calcaas device key (cal_live_…): '));
    if (!apiKey.startsWith('cal_live_')) {
        logError('That does not look like a Calcaas device key (expected cal_live_…).');
        process.exit(1);
    }
    const device = str(flags, 'device') ||
        (await prompt(`Device label [${os.hostname()}]: `)) ||
        os.hostname();
    const endpoint = str(flags, 'endpoint') || existing.endpoint || DEFAULT_ENDPOINT;
    const intervalMinutes = Number(str(flags, 'interval')) || existing.intervalMinutes || 60;
    saveConfig({ apiKey, endpoint, deviceLabel: device, intervalMinutes });
    log(`Saved config → ${configPath()}`);
    log(`Device "${device}" will report to ${endpoint}`);
    log('Next: `calcaas-sync push` for a one-off sync, or `calcaas-sync watch` to keep it updated.');
}
async function runPushOnce(cfg, since) {
    // 1. One aggregate pass to detect which agent CLIs have data. A bad --since
    //    shouldn't strand the sync — fall back to a full pull (idempotent upsert).
    let agg;
    try {
        agg = await fetchDailyRaw({ since });
    }
    catch (e) {
        if (since) {
            logError(`ccusage failed with --since ${since}; retrying a full sync. (${e.message})`);
            since = undefined;
            agg = await fetchDailyRaw({});
        }
        else {
            throw e;
        }
    }
    const detected = detectAgents(agg);
    // If detection finds nothing (e.g. no metadata.agents), sweep all known agents.
    const tools = detected.length > 0 ? detected : SUPPORTED_AGENTS;
    // 2. Pull each tool's data separately and tag it — the cross-tool aggregate
    //    collapses tools into one row, so we can't split it after the fact.
    const records = [];
    const perTool = {};
    for (const agent of tools) {
        let raw;
        try {
            raw = await fetchDailyRaw({ since, tool: agent });
        }
        catch (e) {
            logError(`Skipping ${agent}: ${e.message}`);
            continue;
        }
        const label = toolLabel(agent);
        const recs = normalizeCcusageDaily(raw, { tool: label });
        if (recs.length > 0) {
            records.push(...recs);
            perTool[label] = (perTool[label] ?? 0) + recs.length;
        }
    }
    if (records.length === 0) {
        log('No usage found to sync.');
        return;
    }
    const result = await pushRecords(records, {
        endpoint: cfg.endpoint,
        apiKey: cfg.apiKey,
        deviceLabel: cfg.deviceLabel,
    });
    const toolSummary = Object.entries(perTool)
        .map(([t, n]) => `${t} (${n})`)
        .join(', ');
    log(`Synced ${records.length} record(s) across ${Object.keys(perTool).length} tool(s) [${toolSummary}]: ${result.inserted} new, ${result.updated} updated.`);
}
async function cmdPush(flags) {
    const cfg = requireConfig();
    await runPushOnce(cfg, str(flags, 'since'));
}
async function cmdWatch(flags) {
    const cfg = requireConfig();
    const interval = Number(str(flags, 'interval')) || cfg.intervalMinutes || 60;
    const since = str(flags, 'since');
    log(`Watching — syncing every ${interval} min as device "${cfg.deviceLabel}". Ctrl+C to stop.`);
    const cycle = async () => {
        try {
            await runPushOnce(cfg, since);
        }
        catch (e) {
            logError(`Sync cycle failed (will retry next interval): ${e.message}`);
        }
    };
    await cycle();
    setInterval(() => void cycle(), interval * 60 * 1000);
}
function cmdEnable() {
    // Require config up front — autostart is pointless without a device key.
    requireConfig();
    const target = enableAutostart();
    log(`Autostart enabled → ${target}`);
    log('calcaas-sync will now launch hidden at every login and sync in the background.');
    // Don't make the user wait for the next reboot — start the hidden watcher now.
    startWatchDetached();
    log(`Watcher started in the background. Logs: ${logPath()}`);
}
function cmdDisable() {
    const removed = disableAutostart();
    const target = autostartTarget();
    if (removed) {
        log(`Autostart disabled (removed ${target}).`);
    }
    else {
        log('Autostart was not enabled — nothing to remove.');
    }
    log('A watcher already running in the background keeps going until reboot or you end the process.');
}
function cmdStatus() {
    const cfg = loadConfig();
    log(`Config:    ${configPath()}${cfg.apiKey ? '' : ' (not configured — run `login`)'}`);
    if (cfg.deviceLabel)
        log(`Device:    ${cfg.deviceLabel}`);
    if (cfg.endpoint)
        log(`Endpoint:  ${cfg.endpoint}`);
    const target = autostartTarget();
    if (!target) {
        log('Autostart: not supported on this platform (see README for pm2 / launchd / systemd).');
    }
    else {
        const on = fs.existsSync(target);
        log(`Autostart: ${on ? 'ENABLED' : 'disabled'} (${target})`);
    }
    log(`Log file:  ${logPath()}`);
}
function printHelp() {
    process.stdout.write(`calcaas-sync — push your real AI-tool token usage to Calcaas\n\n` +
        `Usage:\n` +
        `  calcaas-sync login [--key cal_live_…] [--device "name"] [--endpoint URL] [--interval 60]\n` +
        `  calcaas-sync push  [--since YYYY-MM-DD]\n` +
        `  calcaas-sync watch [--interval 60] [--since YYYY-MM-DD]\n` +
        `  calcaas-sync enable | disable | status\n\n` +
        `Commands:\n` +
        `  login    Save your device key + label to ${configPath()}\n` +
        `  push     Run ccusage once, normalize, and upload daily aggregates\n` +
        `  watch    Run push now and then on an interval (default hourly)\n` +
        `  enable   Auto-start a hidden background watcher at every login (survives reboot)\n` +
        `  disable  Remove the autostart entry\n` +
        `  status   Show config, autostart state, and log-file location\n\n` +
        `Privacy: only numeric daily aggregates (tokens, model name, date, cost) are\n` +
        `uploaded. Prompt and response content never leave your machine.\n`);
}
try {
    const { cmd, flags } = parseArgs(process.argv.slice(2));
    switch (cmd) {
        case 'login':
            await cmdLogin(flags);
            break;
        case 'push':
            await cmdPush(flags);
            break;
        case 'watch':
            await cmdWatch(flags);
            break;
        case 'enable':
            cmdEnable();
            break;
        case 'disable':
            cmdDisable();
            break;
        case 'status':
            cmdStatus();
            break;
        case 'help':
        case '--help':
        case '-h':
            printHelp();
            break;
        default:
            logError(`Unknown command: ${cmd}`);
            printHelp();
            process.exit(1);
    }
}
catch (e) {
    logError(e.message);
    process.exit(1);
}
