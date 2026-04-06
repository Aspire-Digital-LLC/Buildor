import { useSkillBuilderStore } from '@/stores/skillBuilderStore';

interface PendingUpdateCardProps {
  field: string;
}

export function PendingUpdateCard({ field }: PendingUpdateCardProps) {
  const pending = useSkillBuilderStore((s) => s.pendingUpdates[field]);
  const acceptPendingUpdate = useSkillBuilderStore((s) => s.acceptPendingUpdate);
  const declinePendingUpdate = useSkillBuilderStore((s) => s.declinePendingUpdate);

  if (!pending) return null;

  return (
    <div style={{
      background: '#0d1b2a',
      border: '1px solid #58a6ff',
      borderRadius: 6,
      padding: '8px 12px',
      marginTop: 6,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ color: '#58a6ff', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>&#9998;</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#58a6ff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>
            Updated by Buildor
          </div>
          <div style={{
            padding: '4px 8px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 4,
            fontFamily: "'Cascadia Code', monospace",
            fontSize: 11,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 120,
            overflow: 'auto',
          }}>
            {pending.displayValue}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={() => acceptPendingUpdate(field)}
              style={{
                background: '#238636',
                border: 'none',
                borderRadius: 4,
                padding: '2px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                color: '#fff',
              }}
            >
              Accept
            </button>
            <button
              onClick={() => declinePendingUpdate(field)}
              style={{
                background: 'transparent',
                border: '1px solid #58a6ff',
                borderRadius: 4,
                padding: '2px 10px',
                fontSize: 11,
                cursor: 'pointer',
                color: '#58a6ff',
              }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
