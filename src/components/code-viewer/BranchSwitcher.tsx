import { useState, useEffect, useRef, useCallback } from 'react';
import { gitListBranches, gitSwitchBranch, gitFetch } from '@/utils/commands/git';
import { logEvent } from '@/utils/commands/logging';
import type { Branch } from '@/types';

interface BranchSwitcherProps {
  repoPath: string;
  currentBranch: string;
  projectName: string;
  onBranchSwitched: (newBranch: string) => void;
  onClose: () => void;
}

export function BranchSwitcher({ repoPath, currentBranch, projectName, onBranchSwitched, onClose }: BranchSwitcherProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch latest from remote first
      await gitFetch(repoPath).catch(() => {});
      const list = await gitListBranches(repoPath);
      setBranches(list);
    } catch (e) {
      setError(String(e));
    }
    setIsLoading(false);
  }, [repoPath]);

  useEffect(() => {
    loadBranches();
    inputRef.current?.focus();
  }, [loadBranches]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSwitch = async (branch: Branch) => {
    if (branch.current || isSwitching) return;
    setIsSwitching(branch.name);
    setError(null);
    try {
      // For remote branches like "origin/feature-x", create a local tracking branch
      let targetBranch = branch.name;
      if (targetBranch.startsWith('origin/')) {
        targetBranch = targetBranch.replace('origin/', '');
      }
      await gitSwitchBranch(repoPath, targetBranch);
      logEvent({
        repo: repoPath,
        functionArea: 'source-control',
        level: 'info',
        operation: 'switch-branch',
        message: `Switched to ${targetBranch}`,
      }).catch(() => {});
      onBranchSwitched(targetBranch);
      onClose();
    } catch (e) {
      setError(String(e));
      setIsSwitching(null);
    }
  };

  const lowerFilter = filter.toLowerCase();

  // Split into local and remote, filter by search
  const localBranches = branches.filter(
    (b) => !b.name.startsWith('origin/') && b.name.toLowerCase().includes(lowerFilter)
  );
  const remoteBranches = branches.filter(
    (b) => b.name.startsWith('origin/') && b.name.toLowerCase().includes(lowerFilter)
      // Hide remote refs that already have a local branch
      && !branches.some((lb) => !lb.name.startsWith('origin/') && b.name === `origin/${lb.name}`)
  );

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: 320,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-secondary)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* Search bar */}
      <div style={{
        padding: '8px',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Switch branch..."
          style={{
            width: '100%',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            padding: '6px 10px',
            fontSize: 12,
            outline: 'none',
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: '#f85149', background: '#1a0d0d' }}>
          {error}
        </div>
      )}

      {/* Branch list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>Loading branches...</div>
        ) : (
          <>
            {/* Local branches */}
            {localBranches.length > 0 && (
              <>
                <div style={{
                  padding: '6px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}>
                  Local
                </div>
                {localBranches.map((branch) => (
                  <BranchItem
                    key={branch.name}
                    branch={branch}
                    isCurrent={branch.current}
                    isSwitching={isSwitching === branch.name}
                    onClick={() => handleSwitch(branch)}
                  />
                ))}
              </>
            )}

            {/* Remote branches */}
            {remoteBranches.length > 0 && (
              <>
                <div style={{
                  padding: '6px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  marginTop: 4,
                }}>
                  Remote
                </div>
                {remoteBranches.map((branch) => (
                  <BranchItem
                    key={branch.name}
                    branch={branch}
                    isCurrent={false}
                    isSwitching={isSwitching === branch.name}
                    onClick={() => handleSwitch(branch)}
                  />
                ))}
              </>
            )}

            {localBranches.length === 0 && remoteBranches.length === 0 && (
              <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>
                No branches matching "{filter}"
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BranchItem({ branch, isCurrent, isSwitching, onClick }: {
  branch: Branch;
  isCurrent: boolean;
  isSwitching: boolean;
  onClick: () => void;
}) {
  const isRemote = branch.name.startsWith('origin/');
  return (
    <div
      onClick={isCurrent ? undefined : onClick}
      style={{
        padding: '5px 10px 5px 16px',
        fontSize: 12,
        color: isCurrent ? '#3fb950' : isRemote ? '#d2a8ff' : 'var(--accent-primary)',
        cursor: isCurrent ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'Cascadia Code', 'Consolas', monospace",
        opacity: isSwitching ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {isCurrent && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {isSwitching && (
        <span style={{ fontSize: 10, color: '#d29922' }}>...</span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {branch.name}
      </span>
    </div>
  );
}
