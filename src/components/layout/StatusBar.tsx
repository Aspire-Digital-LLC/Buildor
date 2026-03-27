import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUsageStore, useTabStore } from '@/stores';
import { queryClaudeStatus } from '@/utils/commands/claude';
import { openLoginWindow, fetchClaudeUsage, hasClaudeSession } from '@/utils/commands/account';
import { logEvent } from '@/utils/commands/logging';
import type { ClaudeStatusInfo } from '@/stores/usageStore';

// ── Parse credentials JSON from Rust backend ────────────────────────────

function parseCredentialsJson(raw: string): ClaudeStatusInfo {
  const info: ClaudeStatusInfo = {
    planType: null,
    planPrice: null,
    tokenUsedPercent: null,
    tokenResetAt: null,
    weeklyTokensUsed: null,
    weeklyTokensLimit: null,
    weeklyUsedPercent: null,
    weeklyResetAt: null,
    version: null,
    raw,
  };

  try {
    const data = JSON.parse(raw);

    // Version from `claude --version`
    if (data.version) {
      info.version = data.version.replace(/^claude code\s*/i, '').replace(/^v/i, '').trim();
    }

    // Plan from credentials
    const sub = (data.subscriptionType || '').toLowerCase();
    const tier = (data.rateLimitTier || '').toLowerCase();

    if (tier.includes('20x')) {
      info.planType = 'Max 20x';
      info.planPrice = '$200/mo';
    } else if (tier.includes('5x')) {
      info.planType = 'Max 5x';
      info.planPrice = '$100/mo';
    } else if (sub === 'max') {
      // Max without specific tier in tier string — check tier for hints
      if (tier.includes('max')) {
        info.planType = 'Claude Max';
        info.planPrice = null; // Will show just "Claude Max" until tier is clearer
      } else {
        info.planType = 'Claude Max';
      }
    } else if (sub === 'team' || tier.includes('team')) {
      info.planType = 'Team';
      info.planPrice = tier.includes('scale') ? '$100/seat' : '$25/seat';
    } else if (sub === 'pro' || tier.includes('pro')) {
      info.planType = 'Pro';
      info.planPrice = '$20/mo';
    } else if (sub === 'enterprise') {
      info.planType = 'Enterprise';
    } else if (sub === 'free' || sub === '') {
      info.planType = sub ? 'Free' : null;
    }

    // Refine Max plan with tier info
    if (info.planType === 'Claude Max' && tier) {
      if (tier.includes('20x')) {
        info.planType = 'Max 20x';
        info.planPrice = '$200/mo';
      } else if (tier.includes('5x')) {
        info.planType = 'Max 5x';
        info.planPrice = '$100/mo';
      }
    }
  } catch {
    // Fall back to text parsing if not JSON
    const lower = raw.toLowerCase();
    if (lower.includes('20x')) { info.planType = 'Max 20x'; info.planPrice = '$200/mo'; }
    else if (lower.includes('5x')) { info.planType = 'Max 5x'; info.planPrice = '$100/mo'; }
    else if (lower.includes('max')) { info.planType = 'Claude Max'; }
    else if (lower.includes('team')) { info.planType = 'Team'; }
    else if (lower.includes('pro')) { info.planType = 'Pro'; }
  }

  return info;
}

// ── Color system: 0-25% blue, 26-50% green, 51-75% orange, 76-100% red ─

function getUsageColor(pct: number): string {
  if (pct <= 25) return '#58a6ff';   // blue
  if (pct <= 50) return '#3fb950';   // green
  if (pct <= 75) return '#d29922';   // orange
  return '#f85149';                   // red
}

function getPlanBadge(plan: string | null, price: string | null): { label: string; color: string } {
  if (!plan) return { label: 'Plan', color: '#484f58' };
  const lower = plan.toLowerCase();
  let color = '#8b949e';
  if (lower.includes('20x')) color = '#a371f7';
  else if (lower.includes('5x')) color = '#d2a8ff';
  else if (lower.includes('max')) color = '#a371f7';
  else if (lower.includes('enterprise')) color = '#f0883e';
  else if (lower.includes('team')) color = '#3fb950';
  else if (lower.includes('pro')) color = '#58a6ff';

  const label = price ? `${plan} ${price}` : plan;
  return { label, color };
}

// ── Sub-components ──────────────────────────────────────────────────────

function MiniBar({ percent, color, width = 80, height = 6 }: {
  percent: number;
  color: string;
  width?: number;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div style={{
      width, height, borderRadius: height / 2, background: 'var(--border-primary)',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{
        width: `${clamped}%`, height: '100%', borderRadius: height / 2,
        background: color,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function StatusItem({ children, title, gap = 6 }: {
  children: React.ReactNode;
  title?: string;
  gap?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap,
        padding: '0 10px', height: '100%',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: 'var(--border-secondary)', flexShrink: 0 }} />;
}

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Claude logo silhouette — simplified iconic shape
function ClaudeIcon({ loggedIn, size = 16 }: { loggedIn: boolean; size?: number }) {
  const color = loggedIn ? '#d4a27a' : '#484f58';
  const opacity = loggedIn ? 1 : 0.5;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity }}>
        {/* Simplified Claude sparkle/asterisk shape */}
        <circle cx="12" cy="12" r="10" fill={loggedIn ? color + '22' : 'none'} stroke={color} strokeWidth="1.5" />
        {/* Inner asterisk pattern — Claude's signature */}
        <line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="5.5" y1="8.5" x2="18.5" y2="15.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="5.5" y1="15.5" x2="18.5" y2="8.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {/* Slash-through when not logged in */}
      {!loggedIn && (
        <svg
          width={size} height={size} viewBox="0 0 24 24"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <line x1="4" y1="4" x2="20" y2="20" stroke="#f85149" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function formatResetTime(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // Handle relative strings like "in 46 min", "46 min" — pass through
  if (/^\d+\s*(min|hr|hour|sec|day)/i.test(dateStr.replace(/^in\s+/, ''))) {
    return dateStr;
  }

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; // Return raw if unparseable

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[d.getDay()];
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    const time = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;

    // If reset is within 7 days, show "Sat 4:00 pm", otherwise "3/28 4:00 pm"
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0 && diffDays <= 7) {
      return `${day} ${time}`;
    }
    return `${month}/${date} ${time}`;
  } catch {
    return dateStr;
  }
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

// ── Main component ──────────────────────────────────────────────────────

interface StatusBarProps {
  sessionId?: string | null;  // Per-window session for CTX tracking
}

export function StatusBar({ sessionId }: StatusBarProps = {}) {
  const status = useUsageStore((s) => s.status);
  const statusLoading = useUsageStore((s) => s.statusLoading);
  const setStatus = useUsageStore((s) => s.setStatus);
  const setStatusLoading = useUsageStore((s) => s.setStatusLoading);
  const [hasSession, setHasSession] = useState(false);
  const isLoggedIn = hasSession || !!(status.planType && status.planType !== 'Plan');
  const openTab = useTabStore((s) => s.openTab);
  // Per-session CTX: use explicit sessionId, or find the most active session
  const sessionCtx = useUsageStore((s) => {
    if (sessionId && s.sessions[sessionId]) return s.sessions[sessionId];
    // No explicit session — pick the one with highest context usage (most active)
    const entries = Object.values(s.sessions);
    if (entries.length === 0) return undefined;
    return entries.reduce((best, cur) =>
      cur.contextUsedTokens > (best?.contextUsedTokens ?? 0) ? cur : best
    , entries[0]);
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch plan info from credentials on mount + every 5 minutes ──
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const raw = await queryClaudeStatus();
      const parsed = parseCredentialsJson(raw);
      // Merge — preserve rate-limit data from stream events
      setStatus({
        ...status,
        planType: parsed.planType ?? status.planType,
        planPrice: parsed.planPrice ?? status.planPrice,
        version: parsed.version ?? status.version,
        raw: parsed.raw,
      });
      logEvent({
        functionArea: 'system', level: 'debug',
        operation: 'query-status', message: `Plan: ${parsed.planType || 'unknown'}, v${parsed.version || '?'}`,
      }).catch(() => {});
    } catch (e) {
      logEvent({
        functionArea: 'system', level: 'debug',
        operation: 'query-status', message: `Status query failed: ${String(e).substring(0, 120)}`,
      }).catch(() => {});
    }
    setStatusLoading(false);
  }, [setStatus, setStatusLoading, status]);

  // Fetch usage from claude.ai API (requires session cookie)
  const fetchUsage = useCallback(async () => {
    try {
      const has = await hasClaudeSession();
      setHasSession(has);
      if (!has) return;

      const raw = await fetchClaudeUsage();
      const data = JSON.parse(raw);

      // Parse five_hour (session) and seven_day (weekly) utilization
      const updates: Partial<typeof status> = {};
      if (data.five_hour) {
        updates.tokenUsedPercent = Math.round(data.five_hour.utilization ?? 0);
        updates.tokenResetAt = data.five_hour.resets_at ?? null;
      }
      if (data.seven_day) {
        updates.weeklyUsedPercent = Math.round(data.seven_day.utilization ?? 0);
        updates.weeklyResetAt = data.seven_day.resets_at ?? null;
      }

      if (Object.keys(updates).length > 0) {
        setStatus({ ...status, ...updates });
      }
    } catch {
      // Session might not exist or be expired — silent fail
    }
  }, [status, setStatus]);

  useEffect(() => {
    fetchStatus();
    fetchUsage();
    pollRef.current = setInterval(() => { fetchStatus(); fetchUsage(); }, 5 * 60 * 1000);

    // Refresh usage when login completes
    const unlisten = listen('login-complete', () => {
      setHasSession(true);
      fetchUsage();
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values — all bars show "% used" (full = bad) ──
  const contextUsedPct = sessionCtx?.contextPercent ?? 0;
  const contextUsedTokens = sessionCtx?.contextUsedTokens ?? 0;
  const contextLimitTokens = sessionCtx?.contextLimitTokens ?? 200_000;
  const contextColor = getUsageColor(contextUsedPct);

  const { label: planLabel, color: planColor } = getPlanBadge(status.planType, status.planPrice);

  const tokenPct = status.tokenUsedPercent ?? 0;
  const tokenColor = getUsageColor(tokenPct);
  const tokenResetFormatted = formatResetTime(status.tokenResetAt) || status.tokenResetAt;

  const weeklyPct = status.weeklyUsedPercent ?? 0;
  const weeklyColor = getUsageColor(weeklyPct);
  const weeklyResetFormatted = formatResetTime(status.weeklyResetAt) || status.weeklyResetAt;

  return (
    <div style={{
      height: 26,
      background: 'var(--statusbar-bg)',
      borderTop: '1px solid var(--border-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 11,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      color: 'var(--text-secondary)',
      flexShrink: 0,
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* ── LEFT SIDE ── */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>

        {/* Plan badge */}
        <StatusItem
          title={`Plan: ${status.planType || 'Unknown'}${status.planPrice ? ` (${status.planPrice})` : ''}\nTier: ${status.raw ? 'from credentials' : 'loading'}${status.version ? `\nClaude Code v${status.version}` : ''}`}
          gap={4}
        >
          <span style={{
            background: planColor + '22',
            color: planColor,
            padding: '1px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            border: `1px solid ${planColor}44`,
            letterSpacing: '0.3px',
          }}>
            {statusLoading && !status.planType ? '...' : planLabel}
          </span>
        </StatusItem>

        <Sep />

        {/* Context % used (full bar = about to auto-compress) */}
        <StatusItem
          title={`Context window: ${contextUsedPct}% used\n${formatTokenCount(contextUsedTokens)} / ${formatTokenCount(contextLimitTokens)} tokens\nAuto-compress triggers at ~95-100%`}
          gap={6}
        >
          <span style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600 }}>CTX</span>
          <MiniBar percent={contextUsedPct} color={contextColor} width={70} height={5} />
          <span style={{
            color: contextColor,
            fontWeight: 700,
            fontSize: 11,
            minWidth: 32,
            textAlign: 'right',
          }}>
            {contextUsedPct}%
          </span>
        </StatusItem>
      </div>

      {/* ── RIGHT SIDE ── */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>

        {/* Session/rate token usage % */}
        <StatusItem
          title={`Session token usage: ${status.tokenUsedPercent != null ? `${tokenPct}% used` : 'No data yet'}${tokenResetFormatted ? `\nRefreshes: ${tokenResetFormatted}` : ''}`}
          gap={5}
        >
          <MiniBar percent={tokenPct} color={tokenColor} width={70} height={5} />
          <span style={{ color: tokenColor, fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
            {status.tokenUsedPercent != null ? `${tokenPct}%` : '--'}
          </span>
        </StatusItem>

        {/* Token refresh time */}
        <StatusItem
          title={tokenResetFormatted ? `Token limit refreshes: ${tokenResetFormatted}` : 'Token refresh time — available during active session'}
          gap={4}
        >
          <ClockIcon />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
            {tokenResetFormatted || '--:--'}
          </span>
        </StatusItem>

        <Sep />

        {/* Weekly usage % */}
        <StatusItem
          title={`Weekly usage: ${status.weeklyUsedPercent != null ? `${weeklyPct}% used` : 'No data yet'}${status.weeklyTokensUsed != null && status.weeklyTokensLimit != null
            ? `\n${formatTokenCount(status.weeklyTokensUsed)} / ${formatTokenCount(status.weeklyTokensLimit)} tokens`
            : ''}${weeklyResetFormatted ? `\nRefreshes: ${weeklyResetFormatted}` : ''}`}
          gap={5}
        >
          <MiniBar percent={weeklyPct} color={weeklyColor} width={70} height={5} />
          <span style={{ color: weeklyColor, fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
            {status.weeklyUsedPercent != null ? `${weeklyPct}%` : '--'}
          </span>
        </StatusItem>

        {/* Weekly refresh time */}
        <StatusItem
          title={weeklyResetFormatted ? `Weekly limit refreshes: ${weeklyResetFormatted}` : 'Weekly refresh time — available during active session'}
          gap={4}
        >
          <ClockIcon />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
            {weeklyResetFormatted || '--:--'}
          </span>
        </StatusItem>

        <Sep />

        {/* Claude login icon — far right */}
        <StatusItem
          title={isLoggedIn
            ? `Logged in to Claude\nPlan: ${status.planType}${status.version ? `\nCLI v${status.version}` : ''}\nClick to open account settings`
            : 'Not logged in — click to sign in to Claude'
          }
          gap={0}
        >
          <div
            onClick={() => {
              if (isLoggedIn) {
                openTab('settings');
              } else {
                openLoginWindow().catch(console.error);
              }
            }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px' }}
          >
            <ClaudeIcon loggedIn={isLoggedIn} size={16} />
          </div>
        </StatusItem>
      </div>
    </div>
  );
}
