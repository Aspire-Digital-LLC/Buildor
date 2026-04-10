import { useState, useEffect } from 'react';
import type { PermissionQueueEntry } from './ClaudeChat';
import { respondToPermissionPooled } from '@/utils/commands/claude';
import { addAutoApproveRule, deriveAutoApproveRule } from '@/utils/autoApprove';
import { buildorEvents } from '@/utils/buildorEvents';

const toolIcons: Record<string, string> = {
  Bash: '\u{1F4BB}',
  Edit: '\u{270F}\u{FE0F}',
  Write: '\u{1F4DD}',
  Read: '\u{1F4C4}',
  Grep: '\u{1F50D}',
  Glob: '\u{1F4C1}',
  Skill: '\u{2699}\u{FE0F}',
  WebSearch: '\u{1F310}',
  WebFetch: '\u{1F310}',
};

interface StickyPermissionCardProps {
  queue: PermissionQueueEntry[];
  sessionId?: string;
}

export function StickyPermissionCard({ queue, sessionId }: StickyPermissionCardProps) {
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(null);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  const current = queue[0] || null;
  const total = queue.length;

  // Reset state when the active permission changes (next in FIFO)
  useEffect(() => {
    if (current?.requestId !== lastRequestId) {
      setResolved(null);
      setFading(false);
      setHidden(false);
      setLastRequestId(current?.requestId || null);
    }
  }, [current?.requestId, lastRequestId]);

  // Fade out after resolution
  useEffect(() => {
    if (resolved) {
      const fadeTimer = setTimeout(() => setFading(true), 1500);
      const hideTimer = setTimeout(() => setHidden(true), 3000);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [resolved]);

  if (!current || hidden) return null;

  const effectiveSessionId = current.agentSessionId || sessionId;
  const icon = toolIcons[current.toolName] || '\u{1F527}';
  const sourceLabel = current.source || 'Chat';

  const handleResponse = async (approved: boolean) => {
    if (!effectiveSessionId || resolved) return;
    try {
      const resourceKey = `tool/${current.toolName}/${effectiveSessionId}`;
      await respondToPermissionPooled(
        effectiveSessionId, current.requestId, approved,
        approved ? current.input : undefined,
        resourceKey, 'user',
      );
      setResolved(approved ? 'approved' : 'denied');
      buildorEvents.emit('permission-resolved', {
        requestId: current.requestId,
        toolUseId: current.toolUseId,
        toolName: current.toolName,
        approved,
      }, effectiveSessionId);
    } catch {
      // silently fail
    }
  };

  const handleAlwaysAllow = async () => {
    await handleResponse(true);
    try {
      const rule = deriveAutoApproveRule(current.toolName, current.input);
      await addAutoApproveRule(rule);
    } catch { /* best-effort */ }
  };

  return (
    <div style={{
      background: 'var(--bg-active)',
      border: `1px solid ${resolved === 'approved' ? '#3fb950' : resolved === 'denied' ? '#f85149' : '#d29922'}`,
      borderRadius: 8,
      margin: '4px 8px',
      transition: 'opacity 1.5s ease-out, max-height 0.5s ease-out',
      opacity: fading ? 0 : 1,
      maxHeight: fading ? 0 : 400,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      animation: !resolved ? 'permPulse 2s ease-in-out infinite' : undefined,
    }}>
      <style>{`
        @keyframes permPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(210, 153, 34, 0); }
          50% { box-shadow: 0 0 8px 2px rgba(210, 153, 34, 0.3); }
        }
      `}</style>

      {/* Header: source label + queue counter */}
      <div style={{
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border-primary)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14 }}>{'\u26A0\uFE0F'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#d29922' }}>
          Permission Required
        </span>
        {/* Source badge */}
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 6px',
          borderRadius: 4,
          background: current.source ? 'rgba(136, 87, 229, 0.15)' : 'rgba(56, 139, 253, 0.15)',
          color: current.source ? '#a371f7' : '#58a6ff',
          border: `1px solid ${current.source ? 'rgba(136, 87, 229, 0.3)' : 'rgba(56, 139, 253, 0.3)'}`,
        }}>
          {sourceLabel}
        </span>
        {/* Queue counter */}
        {total > 1 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 600,
            color: '#d29922',
            background: 'rgba(210, 153, 34, 0.15)',
            padding: '1px 8px',
            borderRadius: 10,
            border: '1px solid rgba(210, 153, 34, 0.3)',
          }}>
            1/{total}
          </span>
        )}
      </div>

      {/* Body: tool info */}
      <div style={{ padding: '8px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{current.toolName}</span>
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginBottom: 6,
          fontFamily: "'Cascadia Code', monospace",
        }}>
          {current.description}
        </div>
        {current.input && current.toolName === 'Bash' && !!current.input.command && (
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontFamily: "'Cascadia Code', monospace",
            marginBottom: 6,
            whiteSpace: 'pre-wrap',
            maxHeight: 80,
            overflow: 'auto',
          }}>
            $ {String(current.input.command)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border-primary)', flexShrink: 0 }}>
        {resolved ? (
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: resolved === 'approved' ? '#3fb950' : '#f85149',
          }}>
            {resolved === 'approved' ? '\u2713 Approved' : '\u2717 Denied'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleResponse(true)}
              style={{
                background: '#238636',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
            <button
              onClick={handleAlwaysAllow}
              style={{
                background: 'var(--border-primary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Always Allow
            </button>
            <button
              onClick={() => handleResponse(false)}
              style={{
                background: 'var(--border-primary)',
                border: '1px solid var(--border-secondary)',
                color: '#f85149',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
