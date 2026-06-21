// Tiny timestamped logger — no dependencies.
function ts() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
export function log(msg) {
    process.stdout.write(`[${ts()}] ${msg}\n`);
}
export function error(msg) {
    process.stderr.write(`[${ts()}] ERROR ${msg}\n`);
}
