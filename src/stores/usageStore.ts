import { create } from 'zustand';
import { buildorEvents } from '@/utils/buildorEvents';
import type { BuildorEvent } from '@/utils/buildorEvents';

// Claude Code runs all models at 1M context as of 2026
// The actual context window is also reported in stream result events (modelUsage.contextWindow)
const DEFAULT_CONTEXT_LIMIT = 1_000_000;

// Threshold at which we proactively send /compact before Claude's internal limit
const AUTO_COMPACT_PERCENT = 95;

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
  isCompacting: boolean;    // true while /compact is in progress
  preCompactTokens: number; // context tokens before compaction started (for divider display)
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
  markCompacting: (sessionId: string) => void;
  markCompactDone: (sessionId: string) => void;
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
  contextLimitTokens: DEFAULT_CONTEXT_LIMIT,
  contextPercent: 0,
  isCompacting: false,
  preCompactTokens: 0,
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
    const contextLimit = DEFAULT_CONTEXT_LIMIT;

    // Output tokens are new each turn — accumulate them.
    // Input tokens represent the full conversation re-sent each turn — use latest, don't sum.
    let newOutput = prev.outputTokens;

    if (data.isResultTotal) {
      // Result event reports session totals — take max to avoid going backwards
      newOutput = Math.max(newOutput, data.outputTokens);
    } else {
      newOutput += data.outputTokens;
    }

    // Context window usage = input + cache_read + cache_creation from the LATEST turn.
    // Each turn's input_tokens already includes the full conversation, so this directly
    // represents how full the context window is. After auto-compress, this drops.
    const turnContext = (data.inputTokens || 0) + (data.cacheReadTokens || 0) + (data.cacheCreationTokens || 0);

    // Only update if we got real data (non-result events with zero tokens = no update).
    // For result totals, skip context update — the per-turn assistant event already set it.
    const contextUsed = (!data.isResultTotal && turnContext > 0) ? turnContext : prev.contextUsedTokens;
    const contextPct = Math.min(100, Math.round((contextUsed / contextLimit) * 100));

    // Track latest turn's input breakdown (not accumulated)
    const newInput = (!data.isResultTotal && turnContext > 0) ? data.inputTokens : prev.inputTokens;
    const newCacheRead = (!data.isResultTotal && (data.cacheReadTokens || 0) > 0) ? (data.cacheReadTokens || 0) : prev.cacheReadTokens;
    const newCacheCreation = (!data.isResultTotal && (data.cacheCreationTokens || 0) > 0) ? (data.cacheCreationTokens || 0) : prev.cacheCreationTokens;

    // Detect compaction completion: context dropped significantly while compacting
    let isCompacting = prev.isCompacting;
    let preCompactTokens = prev.preCompactTokens;
    if (prev.isCompacting && contextUsed > 0 && contextUsed < prev.preCompactTokens * 0.8) {
      isCompacting = false;
      // Emit async to avoid state update during render
      setTimeout(() => buildorEvents.emit('compact-completed', {
        preCompactTokens: prev.preCompactTokens,
        postCompactTokens: contextUsed,
      }, sessionId), 0);
    }

    // Emit auto-compact signal when crossing threshold (only once, not while already compacting)
    if (!prev.isCompacting && !isCompacting && contextPct >= AUTO_COMPACT_PERCENT && prev.contextPercent < AUTO_COMPACT_PERCENT) {
      setTimeout(() => buildorEvents.emit('compact-started', {
        contextPercent: contextPct,
        contextUsedTokens: contextUsed,
      }, sessionId), 0);
    }

    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...prev,
          inputTokens: newInput,
          outputTokens: newOutput,
          cacheReadTokens: newCacheRead,
          cacheCreationTokens: newCacheCreation,
          model,
          contextUsedTokens: contextUsed,
          contextLimitTokens: contextLimit,
          contextPercent: contextPct,
          isCompacting,
          preCompactTokens,
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
    const contextLimit = DEFAULT_CONTEXT_LIMIT;
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

  markCompacting: (sessionId) => set((state) => {
    const prev = state.sessions[sessionId];
    if (!prev) return {};
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: { ...prev, isCompacting: true, preCompactTokens: prev.contextUsedTokens },
      },
    };
  }),

  markCompactDone: (sessionId) => set((state) => {
    const prev = state.sessions[sessionId];
    if (!prev) return {};
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: { ...prev, isCompacting: false },
      },
    };
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
