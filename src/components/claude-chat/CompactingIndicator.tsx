import { useState, useEffect } from 'react';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';
import { useUsageStore } from '@/stores/usageStore';

// CSS keyframes injected once
const styleId = 'compacting-indicator-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes squish {
      0%, 100% { transform: scaleY(1) scaleX(1); }
      50% { transform: scaleY(0.6) scaleX(1.15); }
    }
    @keyframes compactPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes compactShrink {
      0% { width: 100%; }
      100% { width: 30%; }
    }
    @keyframes compactSlideOut {
      0% { opacity: 1; transform: translateY(0) scaleY(1); }
      100% { opacity: 0; transform: translateY(8px) scaleY(0.3); }
    }
  `;
  document.head.appendChild(style);
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface CompactingIndicatorProps {
  sessionId: string;
}

export function CompactingIndicator({ sessionId }: CompactingIndicatorProps) {
  const session = useUsageStore((s) => s.sessions[sessionId]);
  const [dismissing, setDismissing] = useState(false);
  const [visible, setVisible] = useState(true);

  // Listen for compact-completed to trigger dismiss animation
  useEffect(() => {
    const handler = (event: BuildorEvent) => {
      if (event.sessionId !== sessionId) return;
      setDismissing(true);
      setTimeout(() => setVisible(false), 400);
    };
    buildorEvents.on('compact-completed', handler);
    return () => { buildorEvents.off('compact-completed', handler); };
  }, [sessionId]);

  if (!visible || !session?.isCompacting) return null;

  const preTokens = session.preCompactTokens;

  return (
    <div style={{
      padding: '10px 14px',
      borderTop: '1px solid #d2992244',
      background: 'linear-gradient(180deg, #d2992210 0%, var(--bg-secondary) 100%)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      animation: dismissing ? 'compactSlideOut 0.4s ease-out forwards' : undefined,
    }}>
      {/* Squish animation — stacked bars getting compressed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 22, flexShrink: 0 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 4,
              borderRadius: 2,
              background: '#d29922',
              animation: `squish ${0.8 + i * 0.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.12}s`,
              transformOrigin: 'center',
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#d29922',
          animation: 'compactPulse 1.5s ease-in-out infinite',
        }}>
          Compacting context...
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontFamily: "'Cascadia Code', monospace",
        }}>
          {formatTokenCount(preTokens)} tokens — compressing to free space
        </span>
      </div>

      {/* Shrinking bar */}
      <div style={{
        width: 80,
        height: 6,
        borderRadius: 3,
        background: 'var(--border-primary)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{
          height: '100%',
          borderRadius: 3,
          background: 'linear-gradient(90deg, #d29922, #e5a832)',
          animation: 'compactShrink 3s ease-in-out infinite alternate',
        }} />
      </div>
    </div>
  );
}
