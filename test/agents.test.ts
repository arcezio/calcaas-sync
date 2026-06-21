import { describe, expect, it } from 'vitest';
import { detectAgents, toolLabel, SUPPORTED_AGENTS } from '../src/agents.js';

describe('detectAgents', () => {
  it('collects the union of metadata.agents across days', () => {
    const report = {
      daily: [
        { period: '2026-06-01', metadata: { agents: ['claude'] } },
        { period: '2026-06-02', metadata: { agents: ['kilo', 'claude'] } },
        { period: '2026-06-03', metadata: { agents: ['opencode'] } },
      ],
    };
    expect(detectAgents(report).sort()).toEqual(['claude', 'kilo', 'opencode']);
  });

  it('returns [] for empty / malformed shapes', () => {
    expect(detectAgents(null)).toEqual([]);
    expect(detectAgents({})).toEqual([]);
    expect(detectAgents({ daily: [{ period: 'x' }] })).toEqual([]);
    expect(detectAgents({ daily: [{ metadata: { agents: 'nope' } }] })).toEqual([]);
  });
});

describe('toolLabel', () => {
  it('maps claude → claude-code and passes other agents through', () => {
    expect(toolLabel('claude')).toBe('claude-code');
    expect(toolLabel('codex')).toBe('codex');
    expect(toolLabel('opencode')).toBe('opencode');
    expect(toolLabel('kilo')).toBe('kilo');
  });
});

describe('SUPPORTED_AGENTS', () => {
  it('includes the common agent CLIs', () => {
    for (const a of ['claude', 'codex', 'gemini', 'copilot', 'opencode']) {
      expect(SUPPORTED_AGENTS.includes(a)).toBeTruthy();
    }
  });
});
