import { useState, useEffect } from 'react';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';

const BAR_COUNT = 5;

// CSS keyframes injected once
const styleId = 'thinking-indicator-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes waveBar {
      0%, 100% { transform: scaleY(0.3); }
      50% { transform: scaleY(1); }
    }
    @keyframes shimmerSlide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

interface ThinkingIndicatorProps {
  sessionId?: string;
}

export function ThinkingIndicator({ sessionId }: ThinkingIndicatorProps) {
  const [activity, setActivity] = useState<string | null>(null);

  // Listen for tool events to show what Claude is doing
  useEffect(() => {
    const onToolExec = (event: BuildorEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;
      const data = event.data as { toolName?: string; input?: Record<string, unknown> };
      const tool = data.toolName || 'Working';
      let detail = '';
      if (tool === 'Bash') detail = String(data.input?.command || '').split(' ').slice(0, 3).join(' ');
      else if (tool === 'Read' || tool === 'Write' || tool === 'Edit') detail = String(data.input?.file_path || '').split(/[/\\]/).pop() || '';
      else if (tool === 'Grep' || tool === 'Glob') detail = String(data.input?.pattern || '');
      setActivity(detail ? `${tool}: ${detail}` : tool);
    };

    const onToolDone = (event: BuildorEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;
      setActivity(null);
    };

    const onMessage = (event: BuildorEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;
      setActivity(null);
    };

    buildorEvents.on('tool-executing', onToolExec);
    buildorEvents.on('tool-completed', onToolDone);
    buildorEvents.on('message-received', onMessage);
    return () => {
      buildorEvents.off('tool-executing', onToolExec);
      buildorEvents.off('tool-completed', onToolDone);
      buildorEvents.off('message-received', onMessage);
    };
  }, [sessionId]);

  return (
    <div style={{
      padding: '8px 14px',
      borderTop: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      {/* Waveform bars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: 16,
              borderRadius: 1.5,
              background: 'var(--accent-primary)',
              transformOrigin: 'bottom',
              animation: `waveBar ${0.8 + i * 0.15}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          animation: 'pulseGlow 2s ease-in-out infinite',
        }}>
          Claude is thinking...
        </span>
        {activity && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            fontFamily: "'Cascadia Code', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {activity}
          </span>
        )}
      </div>

      {/* Shimmer bar */}
      <div style={{
        width: 60,
        height: 3,
        borderRadius: 2,
        background: 'var(--border-primary)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{
          width: '50%',
          height: '100%',
          borderRadius: 2,
          background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
          animation: 'shimmerSlide 1.5s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}
