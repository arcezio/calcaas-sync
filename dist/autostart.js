import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
// dist/cli.js sits next to this compiled module.
const cliEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js');
function windowsStartupDir() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}
/** The autostart artifact path for this platform, or null if unsupported. */
export function autostartTarget() {
    if (process.platform === 'win32') {
        return path.join(windowsStartupDir(), 'calcaas-sync.vbs');
    }
    return null;
}
/** Register `calcaas-sync watch` to run hidden at login. Returns the entry path. */
export function enableAutostart() {
    if (process.platform !== 'win32') {
        throw new Error(`Automated autostart is currently Windows-only. On ${process.platform}, see the README ` +
            `for pm2 / launchd / systemd setup.`);
    }
    const dir = windowsStartupDir();
    fs.mkdirSync(dir, { recursive: true });
    // A .vbs in the Startup folder is run by WScript at login. Run(cmd, 0, False)
    // launches the watcher with a HIDDEN window (0) and returns immediately (False).
    const node = process.execPath;
    const vbs = [
        "' calcaas-sync autostart - runs the sync watcher hidden at login.",
        'Dim cmd',
        `cmd = Chr(34) & "${node}" & Chr(34) & " " & Chr(34) & "${cliEntry}" & Chr(34) & " watch"`,
        'CreateObject("WScript.Shell").Run cmd, 0, False',
        '',
    ].join('\r\n');
    const target = autostartTarget();
    fs.writeFileSync(target, vbs, 'utf8');
    return target;
}
/** Remove the autostart entry. Returns true if one existed and was removed. */
export function disableAutostart() {
    const target = autostartTarget();
    if (!target)
        return false;
    try {
        fs.unlinkSync(target);
        return true;
    }
    catch {
        return false;
    }
}
/** Start `watch` immediately as a detached, hidden background process. */
export function startWatchDetached() {
    const child = spawn(process.execPath, [cliEntry, 'watch'], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
    });
    child.unref();
}
