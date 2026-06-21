// Pure, dependency-free ccusage → wire-contract normalizer.
// This is the calcaas-sync copy of the canonical logic in the Calcaas repo
// (lib/usage-transform.ts) — kept byte-compatible so both ends agree on the
// snake_case contract the usage-ingest Edge Function expects. Unit-tested in
// test/normalize.test.ts.
function pick(obj, keys) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    const rec = obj;
    for (const k of keys) {
        if (rec[k] != null)
            return rec[k];
    }
    return undefined;
}
function int(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
}
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}
function buildRecord(tool, model, date, src, dayLevel = false) {
    const input = int(pick(src, ['inputTokens', 'input_tokens', 'input']));
    const output = int(pick(src, ['outputTokens', 'output_tokens', 'output']));
    const cacheCreate = int(pick(src, ['cacheCreationTokens', 'cache_creation_tokens', 'cacheCreationInputTokens']));
    const cacheRead = int(pick(src, ['cacheReadTokens', 'cache_read_tokens', 'cacheReadInputTokens']));
    const totalRaw = int(pick(src, ['totalTokens', 'total_tokens']));
    const total = totalRaw > 0 ? totalRaw : input + output + cacheCreate + cacheRead;
    const cost = num(pick(src, dayLevel ? ['totalCost', 'cost', 'costUSD'] : ['cost', 'totalCost', 'costUSD']));
    return {
        tool,
        model,
        usage_date: date,
        input_tokens: input,
        output_tokens: output,
        cache_creation_tokens: cacheCreate,
        cache_read_tokens: cacheRead,
        total_tokens: total,
        reported_cost_usd: cost,
    };
}
/**
 * Convert a `ccusage daily --json` report into one NormalizedRecord per
 * (date × model). Defensive about ccusage's shape: accepts the `{ daily: [...] }`
 * envelope or a bare array; emits one record per modelBreakdowns[] entry when
 * present, else a single day-level aggregate; coerces camelCase → snake_case.
 */
export function normalizeCcusageDaily(report, options = {}) {
    const tool = (options.tool || 'claude-code').trim() || 'claude-code';
    const days = Array.isArray(report)
        ? report
        : Array.isArray(report?.daily)
            ? report.daily
            : [];
    const out = [];
    for (const day of days) {
        // ccusage v20's daily JSON names the date field "period"; older/other shapes
        // use "date". Accept both (plus defensive aliases).
        const date = String(pick(day, ['date', 'period', 'usageDate', 'day']) ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            continue;
        const breakdowns = pick(day, ['modelBreakdowns', 'breakdowns', 'models']);
        if (Array.isArray(breakdowns) && breakdowns.length > 0) {
            for (const b of breakdowns) {
                const model = String(pick(b, ['modelName', 'model', 'name']) ?? '').trim() || 'unknown';
                out.push(buildRecord(tool, model, date, b));
            }
        }
        else {
            const used = pick(day, ['modelsUsed', 'models']);
            const model = Array.isArray(used) && used.length > 0 ? String(used[0]).trim() || 'aggregate' : 'aggregate';
            out.push(buildRecord(tool, model, date, day, true));
        }
    }
    return out;
}
