import { create } from 'zustand';
import { buildorEvents } from '@/utils/buildorEvents';
import type { BuildorEvent } from '@/utils/buildorEvents';

// Known context window sizes per model family
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'opus': 200_000,
  'sonnet': 200_000,
  'haiku': 200_000,
  'opus-4-6[1m]': 1_000_000,
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
};

function getContextLimit(model: string | null): number {
  if (!model) return 200_000;
  const lower = model.toLowerCase();
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (lower.includes(key)) return limit;
  }
  return 200_000;
}

export interface SessionContext {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number;
  costUsd: number;
  durationMs: number;
  model: string | null;
  contextUsedTokens: number;
  contextLimitTokens: number;
  contextPercent: number;   // 0-100, "% used"
}

export interface ClaudeStatusInfo {
  planType: string | null;
  planPrice: string | null;
  tokenUsedPercent: number | null;
  tokenResetAt: string | null;
  weeklyTokensUsed: number | null;
  weeklyTokensLimit: number | null;
  weeklyUsedPercent: number | null;
  weeklyResetAt: string | null;
  version: string | null;
  raw: string;
}

export interface UsageState {
  // Per-session context tracking (keyed by sessionId)
  sessions: Record<string, SessionContext>;

  // Global plan / rate-limit status
  status: ClaudeStatusInfo;
  statusLoading: boolean;
  statusLastFetched: number | null;

  // Actions
  getSessionContext: (sessionId: string) => SessionContext;
  updateSessionUsage: (sessionId: string, data: UsageEventData) => void;
  updateSessionCost: (sessionId: string, data: CostEventData) => void;
  initSession: (sessionId: string, data: SessionStartData) => void;
  clearSession: (sessionId: string) => void;
  setStatus: (status: ClaudeStatusInfo) => void;
  setStatusLoading: (loading: boolean) => void;
}

const DEFAULT_SESSION: SessionContext = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  turns: 0,
  costUsd: 0,
  durationMs: 0,
  model: null,
  contextUsedTokens: 0,
  contextLimitTokens: 200_000,
  contextPercent: 0,
};

interface UsageEventData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
  isResultTotal?: boolean;
  isRateLimitEvent?: boolean;
  sessionUsedPercent?: number | null;
  sessionResetAt?: string | null;
  sessionResetIn?: string | null;
  weeklyUsedPercent?: number | null;
  weeklyResetAt?: string | null;
}

interface CostEventData {
  costUsd: number;
  durationMs: number;
  turns: number;
}

interface SessionStartData {
  model?: string;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  sessions: {},

  status: {
    planType: null,
    planPrice: null,
    tokenUsedPercent: null,
    tokenResetAt: null,
    weeklyTokensUsed: null,
    weeklyTokensLimit: null,
    weeklyUsedPercent: null,
    weeklyResetAt: null,
    version: null,
    raw: '',
  },
  statusLoading: false,
  statusLastFetched: null,

  getSessionContext: (sessionId) => {
    return get().sessions[sessionId] || DEFAULT_SESSION;
  },

  updateSessionUsage: (sessionId, data) => set((state) => {
    // Rate limit events update global status, not per-session
    if (data.isRateLimitEvent) {
      const newStatus = { ...state.status };
      if (data.sessionUsedPercent != null) {
        newStatus.tokenUsedPercent = data.sessionUsedPercent;
        newStatus.tokenResetAt = data.sessionResetAt ?? data.sessionResetIn ?? newStatus.tokenResetAt;
      }
      if (data.weeklyUsedPercent != null) {
        newStatus.weeklyUsedPercent = data.weeklyUsedPercent;
        newStatus.weeklyResetAt = data.weeklyResetAt ?? newStatus.weeklyResetAt;
      }
      return { status: newStatus };
    }

    const prev = state.sessions[sessionId] || { ...DEFAULT_SESSION };
    const model = data.model || prev.model;
    const contextLimit = getContextLimit(model);

    let newInput = prev.inputTokens;
    let newOutput = prev.outputTokens;

    if (data.isResultTotal) {
      newInput = Math.max(newInput, data.inputTokens);
      newOutput = Math.max(newOutput, data.outputTokens);
    } else {
      newInput += data.inputTokens;
      newOutput += data.outputTokens;
    }

    // Context = all input tokens (new + cache read + cache creation)
    // input_tokens from API only counts non-cached; real context includes cached tokens
    const totalInputThisTurn = (data.inputTokens || 0) + (data.cacheReadTokens || 0) + (data.cacheCreationTokens || 0);
    // If we got real data, use it (may decrease after compression). If zero, hold previous.
    const contextUsed = totalInputThisTurn > 0 ? totalInputThisTurn : prev.contextUsedTokens;
    const contextPct = Math.min(100, Math.round((contextUsed / contextLimit) * 100));

    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...prev,
          inputTokens: newInput,
          outputTokens: newOutput,
          cacheReadTokens: prev.cacheReadTokens + (data.cacheReadTokens || 0),
          cacheCreationTokens: prev.cacheCreationTokens + (data.cacheCreationTokens || 0),
          model,
          contextUsedTokens: contextUsed,
          contextLimitTokens: contextLimit,
          contextPercent: contextPct,
        },
      },
    };
  }),

  updateSessionCost: (sessionId, data) => set((state) => {
    const prev = state.sessions[sessionId] || { ...DEFAULT_SESSION };
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...prev,
          costUsd: data.costUsd,
          durationMs: data.durationMs,
          turns: data.turns,
        },
      },
    };
  }),

  initSession: (sessionId, data) => set((state) => {
    const model = data.model || null;
    const contextLimit = getContextLimit(model);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...DEFAULT_SESSION,
          model,
          contextLimitTokens: contextLimit,
        },
      },
    };
  }),

  clearSession: (sessionId) => set((state) => {
    const { [sessionId]: _, ...rest } = state.sessions;
    return { sessions: rest };
  }),

  setStatus: (status) => set({ status, statusLastFetched: Date.now() }),
  setStatusLoading: (loading) => set({ statusLoading: loading }),
}));

// Auto-subscribe to event bus — events carry sessionId
buildorEvents.on('usage-updated', (event: BuildorEvent) => {
  const sid = event.sessionId || '_global';
  useUsageStore.getState().updateSessionUsage(sid, event.data as UsageEventData);
});

buildorEvents.on('cost-updated', (event: BuildorEvent) => {
  const sid = event.sessionId || '_global';
  useUsageStore.getState().updateSessionCost(sid, event.data as CostEventData);
});

buildorEvents.on('session-started', (event: BuildorEvent) => {
  const sid = event.sessionId || '_global';
  useUsageStore.getState().initSession(sid, event.data as SessionStartData);
});

buildorEvents.on('session-ended', (event: BuildorEvent) => {
  const sid = event.sessionId || '_global';
  useUsageStore.getState().clearSession(sid);
});
