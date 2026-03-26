import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PanelContainer } from './PanelContainer';

export function MainLayout() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    fetch('/VERSION')
      .then((r) => r.text())
      .then((v) => setVersion(v.trim()))
      .catch(() => setVersion(''));
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Title bar */}
      <div style={{
        height: 32,
        backgroundColor: '#010409',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 14,
        flexShrink: 0,
        // @ts-expect-error WebkitAppRegion is non-standard CSS for Tauri window dragging
        WebkitAppRegion: 'drag',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0' }}>
          ProductaFlows
        </span>
        {version && (
          <span style={{ fontSize: 11, color: '#6e7681', marginLeft: 6 }}>
            v{version}
          </span>
        )}
      </div>
      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <PanelContainer>
          <Outlet />
        </PanelContainer>
      </div>
    </div>
  );
}
