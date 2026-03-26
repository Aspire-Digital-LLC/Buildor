import type { ReactNode } from 'react';

interface PanelContainerProps {
  children: ReactNode;
}

export function PanelContainer({ children }: PanelContainerProps) {
  return (
    <div style={{
      flex: 1,
      backgroundColor: '#161b22',
      overflow: 'auto',
      padding: 0,
    }}>
      {children}
    </div>
  );
}
