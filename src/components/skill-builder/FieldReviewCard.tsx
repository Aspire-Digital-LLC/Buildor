import { useSkillBuilderStore, type FieldReview } from '@/stores/skillBuilderStore';

interface FieldReviewCardProps {
  field: string;
  onDiscuss: (field: string, message: string) => void;
}

const statusColors: Record<FieldReview['status'], { bg: string; border: string; icon: string; text: string }> = {
  pass: { bg: '#0d2818', border: '#238636', icon: '\u2713', text: '#3fb950' },
  warning: { bg: '#2d1b00', border: '#d29922', icon: '\u26A0', text: '#e3b341' },
  error: { bg: '#2d1215', border: '#da3633', icon: '\u2717', text: '#f85149' },
};

export function FieldReviewCard({ field, onDiscuss }: FieldReviewCardProps) {
  const review = useSkillBuilderStore((s) => s.reviews[field]);
  const acceptReview = useSkillBuilderStore((s) => s.acceptReview);
  const clearReview = useSkillBuilderStore((s) => s.clearReview);

  if (!review) return null;

  const colors = statusColors[review.status];

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
    color: colors.text,
  };

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 6,
      padding: '8px 12px',
      marginTop: 6,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ color: colors.text, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: colors.text, lineHeight: 1.4 }}>{review.message}</div>
          {review.suggestion && (
            <div style={{
              marginTop: 6,
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              fontFamily: "'Cascadia Code', monospace",
              fontSize: 11,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {review.suggestion}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {review.suggestion && (
              <button onClick={() => acceptReview(field)} style={{ ...btnStyle, background: colors.border, color: '#fff' }}>
                Accept
              </button>
            )}
            <button onClick={() => clearReview(field)} style={btnStyle}>
              Decline
            </button>
            <button
              onClick={() => onDiscuss(field, review.message)}
              style={btnStyle}
            >
              Discuss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
