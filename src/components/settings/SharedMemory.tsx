import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getConfig, setConfig, scaffoldSharedRepo } from '@/utils/commands/config';
import { logEvent } from '@/utils/commands/logging';

interface SharedMemoryConfig {
  sharedMemoryRepo?: string;
  sharedMemoryBaseBranch?: string;
  sharedMemoryBranchProtected?: boolean;
}

export function SharedMemory() {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [baseBranch, setBaseBranch] = useState<string>('main');
  const [branchProtected, setBranchProtected] = useState(true);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scaffoldResult, setScaffoldResult] = useState<string[] | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Load config on mount
  useEffect(() => {
    getConfig()
      .then((raw) => {
        const cfg: SharedMemoryConfig = JSON.parse(raw || '{}');
        if (cfg.sharedMemoryRepo) {
          setRepoPath(cfg.sharedMemoryRepo);
          loadBranches(cfg.sharedMemoryRepo);
        }
        if (cfg.sharedMemoryBaseBranch) {
          setBaseBranch(cfg.sharedMemoryBaseBranch);
        }
        if (cfg.sharedMemoryBranchProtected !== undefined) {
          setBranchProtected(cfg.sharedMemoryBranchProtected);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadBranches = async (path: string) => {
    setLoadingBranches(true);
    try {
      const result: string[] = await invoke('get_branches_for_repo', { repoPath: path });
      setBranches(result);
    } catch {
      setBranches([]);
    }
    setLoadingBranches(false);
  };

  const saveConfig = async (updates: Partial<SharedMemoryConfig>) => {
    try {
      const raw = await getConfig();
      const cfg: SharedMemoryConfig = JSON.parse(raw || '{}');
      Object.assign(cfg, updates);
      // Clean up undefined keys
      if (!cfg.sharedMemoryRepo) {
        delete cfg.sharedMemoryRepo;
        delete cfg.sharedMemoryBaseBranch;
        delete cfg.sharedMemoryBranchProtected;
      }
      await setConfig(JSON.stringify(cfg, null, 2));
    } catch (e) {
      logEvent({
        functionArea: 'system',
        level: 'error',
        operation: 'save-shared-memory',
        message: String(e),
      }).catch(() => {});
    }
  };

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Shared Skills/Flows Repository',
    });

    if (selected && typeof selected === 'string') {
      // Scaffold missing structure
      try {
        const created = await scaffoldSharedRepo(selected);
        setScaffoldResult(created.length > 0 ? created : null);
      } catch (e) {
        logEvent({
          functionArea: 'system',
          level: 'error',
          operation: 'scaffold-shared-repo',
          message: String(e),
        }).catch(() => {});
      }

      setRepoPath(selected);
      await loadBranches(selected);
      await saveConfig({ sharedMemoryRepo: selected });
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'set-shared-memory',
        message: `Shared memory repo set to: ${selected}`,
      }).catch(() => {});
    }
  };

  const handleRemove = async () => {
    setRepoPath(null);
    setBranches([]);
    setBaseBranch('main');
    setBranchProtected(true);
    setScaffoldResult(null);
    await saveConfig({
      sharedMemoryRepo: undefined,
      sharedMemoryBaseBranch: undefined,
      sharedMemoryBranchProtected: undefined,
    });
  };

  const handleBaseBranchChange = async (branch: string) => {
    setBaseBranch(branch);
    await saveConfig({ sharedMemoryBaseBranch: branch });
  };

  const handleProtectionToggle = async (isProtected: boolean) => {
    setBranchProtected(isProtected);
    await saveConfig({ sharedMemoryBranchProtected: isProtected });
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

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18 }}>Shared Memory</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Point to a local git repository that holds your team's shared skills, flows, and configurations.
        This repo will be synced automatically.
      </p>

      {repoPath ? (
        <>
          {/* Repo path card */}
          <div style={cardStyle}>
            <div style={labelStyle}>Repository Path</div>
            <div style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: "'Cascadia Code', monospace",
              marginBottom: 8,
            }}>
              {repoPath}
            </div>
            {scaffoldResult && scaffoldResult.length > 0 && (
              <div style={{
                background: '#0d2818',
                border: '1px solid #238636',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 8,
                fontSize: 12,
                color: '#3fb950',
              }}>
                Scaffolded missing structure: {scaffoldResult.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleSelectFolder}
                style={{
                  background: 'var(--border-primary)',
                  border: '1px solid var(--border-secondary)',
                  color: 'var(--text-primary)',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Change
              </button>
              <button
                onClick={handleRemove}
                style={{
                  background: 'var(--border-primary)',
                  border: '1px solid #da3633',
                  color: '#f85149',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          </div>

          {/* Base branch */}
          <div style={cardStyle}>
            <div style={labelStyle}>Base Development Branch</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px' }}>
              The default branch to load when Buildor starts. Changes branch off from here.
            </p>
            {loadingBranches ? (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Loading branches...</span>
            ) : (
              <select
                value={baseBranch}
                onChange={(e) => handleBaseBranchChange(e.target.value)}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  padding: '6px 10px',
                  fontSize: 13,
                  fontFamily: "'Cascadia Code', monospace",
                  cursor: 'pointer',
                  minWidth: 200,
                  outline: 'none',
                }}
              >
                {branches.length === 0 && (
                  <option value={baseBranch}>{baseBranch}</option>
                )}
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          {/* Branch protection */}
          <div style={cardStyle}>
            <div style={labelStyle}>Branch Protection</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 10px' }}>
              Controls how Buildor pushes changes to this repository.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 12px',
                  background: branchProtected ? 'var(--bg-active)' : 'var(--bg-primary)',
                  border: `1px solid ${branchProtected ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="branchProtection"
                  checked={branchProtected}
                  onChange={() => handleProtectionToggle(true)}
                  style={{ marginTop: 2, accentColor: 'var(--accent-primary)' }}
                />
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    Branch protected (requires PR)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Changes are committed to a new branch and a pull request is opened to merge back into the base branch.
                  </div>
                </div>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 12px',
                  background: !branchProtected ? 'var(--bg-active)' : 'var(--bg-primary)',
                  border: `1px solid ${!branchProtected ? 'var(--accent-secondary)' : 'var(--border-primary)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="branchProtection"
                  checked={!branchProtected}
                  onChange={() => handleProtectionToggle(false)}
                  style={{ marginTop: 2, accentColor: 'var(--accent-primary)' }}
                />
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    Branch not protected (push directly)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Changes are committed and pushed directly to the base branch.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </>
      ) : (
        <div style={{
          border: '1px dashed var(--border-secondary)',
          borderRadius: 8,
          padding: '32px 20px',
          textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 12 }}>
            No shared repository configured
          </p>
          <button
            onClick={handleSelectFolder}
            style={{
              background: '#238636',
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Select Repository
          </button>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Expected Structure
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
          {'shared-repo/\n├── .buildor.json          # repo config\n├── defaults.json          # org-wide skill defaults\n├── flows/                 # flow definitions\n│   ├── develop.json\n│   └── hotfix.json\n└── skills/                # buildor skills\n    ├── code-review/\n    │   ├── skill.json      # metadata + params\n    │   └── prompt.md       # prompt template\n    └── research-topic/\n        ├── skill.json\n        ├── prompt.md\n        └── reference.md    # supporting files'}
        </div>
      </div>
    </div>
  );
}
