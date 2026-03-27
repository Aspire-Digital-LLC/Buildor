import { useState, useEffect, useCallback } from 'react';
import { checkForUpdate } from '@/utils/commands/config';
import { logEvent } from '@/utils/commands/logging';

export function UpdateChecker() {
  const [localVersion, setLocalVersion] = useState<string>('...');
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doCheck = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    try {
      const [local, remote, needs] = await checkForUpdate();
      setLocalVersion(local);
      setRemoteVersion(remote);
      setNeedsUpdate(needs);
      setLastChecked(new Date().toLocaleTimeString());
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'check-update',
        message: `Version check: local=${local}, remote=${remote}, needsUpdate=${needs}`,
      }).catch(() => {});
    } catch (e) {
      setError(String(e));
      logEvent({
        functionArea: 'system',
        level: 'error',
        operation: 'check-update',
        message: `Update check failed: ${String(e)}`,
      }).catch(() => {});
    }
    setIsChecking(false);
  }, []);

  // Check on mount
  useEffect(() => {
    doCheck();
  }, [doCheck]);

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18 }}>Updates</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Check for new versions of Buildor.
      </p>

      {/* Version info */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: `1px solid ${needsUpdate ? '#d29922' : 'var(--border-primary)'}`,
        borderRadius: 8,
        padding: '16px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
              Installed Version
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              v{localVersion}
            </div>
          </div>
          {remoteVersion && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
                Latest Version
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 600,
                color: needsUpdate ? '#d29922' : '#3fb950',
              }}>
                v{remoteVersion}
              </div>
            </div>
          )}
        </div>

        {needsUpdate ? (
          <div style={{
            background: 'var(--bg-active)',
            border: '1px solid #d29922',
            borderRadius: 6,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, color: '#d29922', fontWeight: 600 }}>
                Update Available
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                v{localVersion} → v{remoteVersion}
              </div>
            </div>
            <a
              href="https://github.com/Aspire-Digital-LLC/Buildor/releases"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#238636',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Download Update
            </a>
          </div>
        ) : remoteVersion && (
          <div style={{
            fontSize: 13,
            color: '#3fb950',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            You're up to date
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#3d1f1f',
          border: '1px solid #6e3030',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          color: '#f88',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={doCheck}
          disabled={isChecking}
          style={{
            background: 'var(--border-primary)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: isChecking ? 'default' : 'pointer',
            opacity: isChecking ? 0.6 : 1,
          }}
        >
          {isChecking ? 'Checking...' : 'Check for Updates'}
        </button>
        {lastChecked && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Last checked: {lastChecked}
          </span>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        Source: github.com/Aspire-Digital-LLC/Buildor
      </div>
    </div>
  );
}
