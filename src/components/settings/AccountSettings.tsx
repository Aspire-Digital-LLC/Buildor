import { useState, useEffect } from 'react';
import { useUsageStore } from '@/stores';
import { openLoginWindow, hasClaudeSession, clearClaudeSession, fetchClaudeUsage, startUsagePolling } from '@/utils/commands/account';
import { logEvent } from '@/utils/commands/logging';
import { listen } from '@tauri-apps/api/event';

function getUsageColor(pct: number): string {
  if (pct <= 25) return '#58a6ff';
  if (pct <= 50) return '#3fb950';
  if (pct <= 75) return '#d29922';
  return '#f85149';
}

function UsageBar({ label, percent, resetAt }: { label: string; percent: number | null; resetAt: string | null }) {
  const pct = percent ?? 0;
  const color = getUsageColor(pct);
  const resetFormatted = resetAt ? formatReset(resetAt) : null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 13, color, fontWeight: 600 }}>
          {percent != null ? `${pct}% used` : 'No data'}
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 4, background: 'var(--border-primary)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 4,
          background: color, transition: 'width 0.4s ease',
        }} />
      </div>
      {resetFormatted && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Resets {resetFormatted}
        </div>
      )}
    </div>
  );
}

function formatReset(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${days[d.getDay()]} ${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  } catch {
    return dateStr;
  }
}

export function AccountSettings() {
  const status = useUsageStore((s) => s.status);
  const setStatus = useUsageStore((s) => s.setStatus);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [usageData, setUsageData] = useState<{
    fiveHour?: { utilization: number; resets_at: string };
    sevenDay?: { utilization: number; resets_at: string };
    sevenDaySonnet?: { utilization: number; resets_at: string };
  } | null>(null);

  const checkSession = async () => {
    try {
      const has = await hasClaudeSession();
      setLoggedIn(has);
      if (has) await refreshUsage();
    } catch { /* ignore */ }
    setLoading(false);
  };

  const refreshUsage = async () => {
    try {
      const raw = await fetchClaudeUsage();
      const data = JSON.parse(raw);
      setUsageData({
        fiveHour: data.five_hour || undefined,
        sevenDay: data.seven_day || undefined,
        sevenDaySonnet: data.seven_day_sonnet || undefined,
      });
      // Also update the global store
      setStatus({
        ...status,
        tokenUsedPercent: data.five_hour ? Math.round(data.five_hour.utilization) : status.tokenUsedPercent,
        tokenResetAt: data.five_hour?.resets_at ?? status.tokenResetAt,
        weeklyUsedPercent: data.seven_day ? Math.round(data.seven_day.utilization) : status.weeklyUsedPercent,
        weeklyResetAt: data.seven_day?.resets_at ?? status.weeklyResetAt,
      });
    } catch {
      // Session may be expired
    }
  };

  useEffect(() => {
    checkSession();
    const unlistenLogin = listen<string>('login-complete', (event) => {
      setLoggedIn(true);
      setLoggingIn(false);
      // Parse usage data from the login event payload
      try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (payload?.usage) {
          setUsageData({
            fiveHour: payload.usage.five_hour || undefined,
            sevenDay: payload.usage.seven_day || undefined,
            sevenDaySonnet: payload.usage.seven_day_sonnet || undefined,
          });
          setStatus({
            ...status,
            tokenUsedPercent: payload.usage.five_hour ? Math.round(payload.usage.five_hour.utilization) : status.tokenUsedPercent,
            tokenResetAt: payload.usage.five_hour?.resets_at ?? status.tokenResetAt,
            weeklyUsedPercent: payload.usage.seven_day ? Math.round(payload.usage.seven_day.utilization) : status.weeklyUsedPercent,
            weeklyResetAt: payload.usage.seven_day?.resets_at ?? status.weeklyResetAt,
          });
        }
      } catch { refreshUsage(); }
    });
    const unlistenRefresh = listen<string>('usage-refreshed', (event) => {
      try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (payload?.usage) {
          setUsageData({
            fiveHour: payload.usage.five_hour || undefined,
            sevenDay: payload.usage.seven_day || undefined,
            sevenDaySonnet: payload.usage.seven_day_sonnet || undefined,
          });
        }
      } catch { /* ignore */ }
    });
    return () => {
      unlistenLogin.then((fn) => fn());
      unlistenRefresh.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      await openLoginWindow();
      logEvent({
        functionArea: 'system', level: 'info',
        operation: 'login', message: 'Login window opened',
      }).catch(() => {});
    } catch (e) {
      setLoggingIn(false);
      logEvent({
        functionArea: 'system', level: 'error',
        operation: 'login', message: `Login failed: ${String(e)}`,
      }).catch(() => {});
    }
  };

  const handleLogout = async () => {
    try {
      await clearClaudeSession();
      setLoggedIn(false);
      setUsageData(null);
      logEvent({
        functionArea: 'system', level: 'info',
        operation: 'logout', message: 'Session cleared',
      }).catch(() => {});
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading...</div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, overflow: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px' }}>
        Claude Account
      </h2>

      {!loggedIn ? (
        /* ── NOT LOGGED IN ── */
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            Sign in to your Claude account to see real-time usage data — session limits, weekly quotas, and reset times.
          </p>
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            style={{
              background: '#d4a27a',
              border: 'none',
              color: '#1a1a2e',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 700,
              cursor: loggingIn ? 'default' : 'pointer',
              opacity: loggingIn ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Claude asterisk icon */}
            <svg width="16" height="16" viewBox="0 0 24 24">
              <line x1="12" y1="4" x2="12" y2="20" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="5" y1="8" x2="19" y2="16" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="5" y1="16" x2="19" y2="8" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {loggingIn ? 'Opening login...' : 'Sign in to Claude'}
          </button>
          {loggingIn && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
              A browser window will open. Sign in and it will close automatically.
            </p>
          )}
        </div>
      ) : (
        /* ── LOGGED IN ── */
        <div>
          {/* Plan info */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                Plan
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {status.planType || 'Claude'}
                {status.planPrice && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                    {status.planPrice}
                  </span>
                )}
              </div>
              {status.version && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Claude Code v{status.version}
                </div>
              )}
            </div>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#3fb950',
            }} />
          </div>

          {/* Usage bars */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}>
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: 12,
            }}>
              Usage Limits
            </div>

            <UsageBar
              label="Current Session (5-hour)"
              percent={usageData?.fiveHour ? Math.round(usageData.fiveHour.utilization) : null}
              resetAt={usageData?.fiveHour?.resets_at ?? null}
            />
            <UsageBar
              label="Weekly — All Models"
              percent={usageData?.sevenDay ? Math.round(usageData.sevenDay.utilization) : null}
              resetAt={usageData?.sevenDay?.resets_at ?? null}
            />
            {usageData?.sevenDaySonnet && (
              <UsageBar
                label="Weekly — Sonnet Only"
                percent={Math.round(usageData.sevenDaySonnet.utilization)}
                resetAt={usageData.sevenDaySonnet.resets_at}
              />
            )}

            <button
              onClick={() => { startUsagePolling().catch(() => {}); refreshUsage(); }}
              style={{
                background: 'var(--border-primary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Refresh
            </button>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-tertiary)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
