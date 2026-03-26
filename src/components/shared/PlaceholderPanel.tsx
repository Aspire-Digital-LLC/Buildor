interface PlaceholderPanelProps {
  title: string;
  icon?: string;
  description?: string;
}

export function PlaceholderPanel({ title, icon, description }: PlaceholderPanelProps) {
  return (
    <div style={{
      border: '1px dashed #555',
      borderRadius: 8,
      padding: 32,
      margin: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      color: '#ccc',
      backgroundColor: '#1a1a2e',
    }}>
      {icon && <span style={{ fontSize: 48, marginBottom: 12 }}>{icon}</span>}
      <h2 style={{ margin: '0 0 8px 0', color: '#e0e0e0' }}>{title}</h2>
      {description && <p style={{ margin: 0, color: '#888', textAlign: 'center', maxWidth: 400 }}>{description}</p>}
    </div>
  );
}
