class FatalPushError extends Error {
}
/** POST records to the ingest endpoint in batches, with retry/backoff per batch. */
export async function pushRecords(records, opts) {
    const batchSize = opts.batchSize ?? 500;
    const retries = opts.retries ?? 3;
    let inserted = 0;
    let updated = 0;
    let batches = 0;
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const res = await postWithRetry(batch, opts, retries);
        inserted += res.inserted ?? 0;
        updated += res.updated ?? 0;
        batches += 1;
    }
    return { inserted, updated, batches };
}
async function postWithRetry(records, opts, retries) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(opts.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${opts.apiKey}`,
                },
                body: JSON.stringify({
                    deviceLabel: opts.deviceLabel,
                    source: opts.source ?? 'ccusage',
                    records,
                }),
            });
            // Auth failures are not worth retrying — surface immediately.
            if (res.status === 401 || res.status === 403) {
                throw new FatalPushError('API key rejected. Re-run `calcaas-sync login` with a fresh key.');
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${await safeText(res)}`);
            }
            return (await res.json());
        }
        catch (e) {
            if (e instanceof FatalPushError)
                throw e;
            lastErr = e;
            if (attempt < retries)
                await sleep(backoffMs(attempt));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Push failed after retries.');
}
function backoffMs(attempt) {
    return Math.min(30_000, 1000 * 2 ** attempt);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function safeText(res) {
    try {
        return (await res.text()).slice(0, 200);
    }
    catch {
        return '';
    }
}
