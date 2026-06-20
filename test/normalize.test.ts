import { describe, expect, it } from 'vitest';
import { normalizeCcusageDaily } from '../src/normalize.js';

describe('normalizeCcusageDaily', () => {
  it('emits one record per model breakdown (ccusage daily --json shape)', () => {
    const report = {
      daily: [
        {
          date: '2026-06-01',
          inputTokens: 900,
          outputTokens: 1500,
          cacheCreationTokens: 512,
          cacheReadTokens: 1024,
          totalTokens: 3936,
          totalCost: 0.42,
          modelsUsed: ['claude-opus-4-1-20250805'],
          modelBreakdowns: [
            {
              modelName: 'claude-opus-4-1-20250805',
              inputTokens: 800,
              outputTokens: 1000,
              cacheCreationTokens: 512,
              cacheReadTokens: 1024,
              cost: 0.4,
            },
            { modelName: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 500, cost: 0.02 },
          ],
        },
      ],
      totals: {},
    };
    const out = normalizeCcusageDaily(report, { tool: 'claude-code' });
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      tool: 'claude-code',
      model: 'claude-opus-4-1-20250805',
      usage_date: '2026-06-01',
      input_tokens: 800,
      output_tokens: 1000,
      cache_creation_tokens: 512,
      cache_read_tokens: 1024,
      total_tokens: 3336, // derived from the four token fields
      reported_cost_usd: 0.4,
    });
    expect(out[1].model).toBe('claude-sonnet-4-20250514');
    expect(out[1].total_tokens).toBe(600);
  });

  it('falls back to a day-level aggregate when there are no breakdowns', () => {
    const out = normalizeCcusageDaily({
      daily: [
        {
          date: '2026-06-02',
          inputTokens: 1000,
          outputTokens: 2000,
          totalTokens: 3000,
          totalCost: 0.5,
          modelsUsed: ['claude-opus-4-1-20250805'],
        },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0].tool).toBe('claude-code');
    expect(out[0].model).toBe('claude-opus-4-1-20250805');
    expect(out[0].total_tokens).toBe(3000);
    expect(out[0].reported_cost_usd).toBe(0.5);
  });

  it('reads ccusage v20\'s "period" date field (real-output shape)', () => {
    const out = normalizeCcusageDaily({
      daily: [
        {
          agent: 'all',
          period: '2026-03-22',
          inputTokens: 59253,
          outputTokens: 7234,
          cacheReadTokens: 558291,
          cacheCreationTokens: 0,
          totalTokens: 625454,
          totalCost: 0,
          metadata: { agents: ['kilo'] },
          modelBreakdowns: [
            { modelName: 'kilo-auto/free', inputTokens: 59253, outputTokens: 7234, cacheReadTokens: 558291, cost: 0 },
          ],
        },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0].usage_date).toBe('2026-03-22');
    expect(out[0].model).toBe('kilo-auto/free');
    expect(out[0].cache_read_tokens).toBe(558291);
  });

  it('skips malformed dates and clamps junk numerics', () => {
    const out = normalizeCcusageDaily([
      { date: '2026-06-03', inputTokens: -5, outputTokens: 'oops', cost: -1 },
      { date: 'nope', inputTokens: 999 },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].model).toBe('aggregate');
    expect(out[0].input_tokens).toBe(0);
    expect(out[0].output_tokens).toBe(0);
    expect(out[0].reported_cost_usd).toBe(0);
  });
});
