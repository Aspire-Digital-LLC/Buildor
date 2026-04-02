import { useState, useEffect, useCallback } from 'react';
import {
  configureSharedRepo,
  removeSharedRepoConfig,
  syncSkillsRepo,
  pushSkillChanges,
  getSyncStatus,
  type SyncStatus,
} from '@/utils/commands/skillSync';
import { logEvent } from '@/utils/commands/logging';
import { buildorEvents } from '@/utils/buildorEvents';

export function SharedSkillsRepo() {
  const [repoUrl, setRepoUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const s = await getSyncStatus();
      setStatus(s);
      if (s.repoUrl) {
        setRepoUrl(s.repoUrl);
        setInputUrl(s.repoUrl);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleConfigure = async () => {
    if (!inputUrl.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await configureSharedRepo(inputUrl.trim());
      setRepoUrl(inputUrl.trim());
      setSuccess('Repository URL saved');
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'configure-shared-skills-repo',
        message: `Shared skills repo set to: ${inputUrl.trim()}`,
      }).catch(() => {});
      await loadStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async () => {
    setError(null);
    setSuccess(null);
    try {
      await removeSharedRepoConfig();
      setRepoUrl('');
      setInputUrl('');
      setStatus(null);
      setSuccess('Repository configuration removed');
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'remove-shared-skills-repo',
        message: 'Shared skills repo configuration removed',
      }).catch(() => {});
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSync = async () => {
    setError(null);
    setSuccess(null);
    setSyncing(true);
    const startMs = Date.now();
    try {
      const result = await syncSkillsRepo();
      setStatus(result);
      setSuccess('Skills synced successfully');
      // Emit event so useSkills can refresh
      buildorEvents.emit('skill-activated', { reason: 'sync' });
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'sync-skills-repo',
        message: 'Shared skills repo synced successfully',
        durationMs: Date.now() - startMs,
      }).catch(() => {});
    } catch (e) {
      setError(String(e));
      logEvent({
        functionArea: 'system',
        level: 'error',
        operation: 'sync-skills-repo',
        message: String(e),
        durationMs: Date.now() - startMs,
      }).catch(() => {});
    } finally {
      setSyncing(false);
    }
  };

  const handlePush = async () => {
    if (!pushMessage.trim()) {
      setError('Commit message is required');
      return;
    }
    setError(null);
    setSuccess(null);
    setPushing(true);
    try {
      await pushSkillChanges(pushMessage.trim());
      setPushMessage('');
      setSuccess('Changes pushed successfully');
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'push-skills-repo',
        message: `Pushed skill changes: ${pushMessage.trim()}`,
      }).catch(() => {});
      await loadStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setPushing(false);
    }
  };

  if (loading) return null;

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: 4,
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-secondary)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: "'Cascadia Code', monospace",
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--border-primary)',
    border: '1px solid var(--border-secondary)',
    color: 'var(--text-primary)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: '#238636',
    border: '1px solid #238636',
    color: '#fff',
    fontWeight: 600,
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch { return iso; }
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18 }}>
        Shared Skills Repository
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Configure a git repository to share Buildor skills across your team.
        Skills are synced to <code style={{ fontSize: 12 }}>~/.buildor/skills/</code>.
      </p>

      {/* Feedback banners */}
      {error && (
        <div style={{
          background: '#2d1215',
          border: '1px solid #da3633',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: '#f85149',
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: '#0d2818',
          border: '1px solid #238636',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: '#3fb950',
        }}>
          {success}
        </div>
      )}

      {/* Repo URL config */}
      <div style={cardStyle}>
        <div style={labelStyle}>Repository URL</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px' }}>
          HTTPS or SSH URL for the shared skills git repository.
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://github.com/org/buildor-skills.git"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfigure(); }}
          />
          <button onClick={handleConfigure} style={btnPrimaryStyle} disabled={!inputUrl.trim()}>
            Save
          </button>
          {repoUrl && (
            <button
              onClick={handleRemove}
              style={{ ...btnStyle, border: '1px solid #da3633', color: '#f85149' }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Sync status */}
      {repoUrl && (
        <div style={cardStyle}>
          <div style={labelStyle}>Sync Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Repository</span>
              <span style={{ color: status?.repoExists ? '#3fb950' : 'var(--text-tertiary)' }}>
                {status?.repoExists ? 'Cloned' : 'Not cloned'}
              </span>
            </div>
            {status?.currentBranch && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Branch</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: "'Cascadia Code', monospace", fontSize: 12 }}>
                  {status.currentBranch}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Working tree</span>
              <span style={{ color: status?.isClean ? '#3fb950' : '#d29922' }}>
                {status?.isClean ? 'Clean' : 'Dirty (local changes)'}
              </span>
            </div>
            {status?.isDiverged && (
              <div style={{
                background: '#2d1b00',
                border: '1px solid #d29922',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                color: '#e3b341',
                marginTop: 4,
              }}>
                Local and remote have diverged. Push your changes or resolve manually.
              </div>
            )}
            {status?.lastSynced && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last synced</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {formatTime(status.lastSynced)}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={handleSync} style={btnPrimaryStyle} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={loadStatus} style={btnStyle}>
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Push changes */}
      {repoUrl && status?.repoExists && !status?.isClean && (
        <div style={cardStyle}>
          <div style={labelStyle}>Push Local Changes</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px' }}>
            Commit and push local skill edits to the shared repository.
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={pushMessage}
              onChange={(e) => setPushMessage(e.target.value)}
              placeholder="Commit message..."
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePush(); }}
            />
            <button onClick={handlePush} style={btnStyle} disabled={pushing || !pushMessage.trim()}>
              {pushing ? 'Pushing...' : 'Push'}
            </button>
          </div>
        </div>
      )}

      {/* Repo structure info */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Expected Repository Structure
        </div>
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: "'Cascadia Code', monospace",
          color: 'var(--text-secondary)',
          lineHeight: 1.8,
          whiteSpace: 'pre',
        }}>
          {'buildor-skills/\n\u251C\u2500\u2500 defaults.json              # org-wide fallback config\n\u251C\u2500\u2500 analyze-performance/\n\u2502   \u251C\u2500\u2500 skill.json             # machine-readable entry point\n\u2502   \u251C\u2500\u2500 prompt.md              # prompt template\n\u2502   \u2514\u2500\u2500 scripts/profiler.js    # supporting files\n\u251C\u2500\u2500 run-tests/\n\u2502   \u251C\u2500\u2500 skill.json\n\u2502   \u2514\u2500\u2500 prompt.md\n\u2514\u2500\u2500 ...'}
        </div>
      </div>
    </div>
  );
}
