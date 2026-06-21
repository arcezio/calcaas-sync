// Multi-tool helpers (Phase 2). ccusage v20 detects many agent CLIs (claude,
// codex, gemini, copilot, opencode, kilo, …) but its cross-tool `daily` report
// collapses them into one "all" row per day. So we detect which agents actually
// have data, then pull each one's `<agent> daily --json` separately and tag the
// rows by tool — that's what feeds the dashboard's "By tool" breakdown.
// Map a ccusage agent id to a stable dashboard tool label. Most pass through
// verbatim; only well-known names are remapped for clarity.
const TOOL_LABEL = {
    claude: 'claude-code',
};
export function toolLabel(agent) {
    return TOOL_LABEL[agent] ?? agent;
}
// Every agent subcommand ccusage exposes (from `ccusage --help`). Used as a
// fallback when metadata-based detection turns up nothing, so a machine whose
// report lacks `metadata.agents` is still swept across all known tools.
export const SUPPORTED_AGENTS = [
    'claude', 'codex', 'gemini', 'copilot', 'opencode', 'kilo', 'qwen', 'kimi',
    'amp', 'droid', 'goose', 'codebuff', 'hermes', 'pi', 'openclaw',
];
// Which agents actually have data, from the aggregate report's per-day
// `metadata.agents`. Pure + defensive about shape.
export function detectAgents(aggregateReport) {
    const days = Array.isArray(aggregateReport?.daily)
        ? aggregateReport.daily
        : [];
    const set = new Set();
    for (const d of days) {
        const agents = d?.metadata?.agents;
        if (Array.isArray(agents)) {
            for (const a of agents)
                if (typeof a === 'string' && a.trim())
                    set.add(a.trim());
        }
    }
    return [...set];
}
