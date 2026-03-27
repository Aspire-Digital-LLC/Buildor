import { useState, useRef, useEffect } from 'react';
import { logEvent } from '@/utils/commands/logging';
import { useProjectStore, useGitStore } from '@/stores';
import { useTabContext } from '@/contexts/TabContext';
import {
  gitMerge,
  gitRebase,
  gitUndoLastCommit,
  gitDeleteBranch,
  gitStash,
  gitStashPop,
  gitFetch,
  gitRevertLastPush,
  gitCreateBranch,
  gitSwitchBranch,
  gitListBranches,
} from '@/utils/commands/git';
import type { Branch } from '@/types';

type ModalType = 'none' | 'branches' | 'create-branch' | 'merge' | 'rebase' | 'delete-branch' | 'confirm';

interface ConfirmAction {
  label: string;
  description: string;
  action: () => Promise<void>;
}

export function GitMenu() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>('none');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { projectName } = useTabContext();
  const { projects } = useProjectStore();
  const activeProject = projects.find((p) => p.name === projectName) || null;
  const { refreshStatus } = useGitStore();
  const repoPath = activeProject?.repoPath;

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Clear feedback after 3s
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  if (!repoPath) return null;

  const loadBranches = async () => {
    const b = await gitListBranches(repoPath);
    setBranches(b.filter(br => !br.name.startsWith('remotes/')));
  };

  const runAndRefresh = async (fn: () => Promise<unknown>, successMsg: string) => {
    const startTime = new Date().toISOString();
    try {
      await fn();
      await refreshStatus(repoPath);
      const endTime = new Date().toISOString();
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      setFeedback(successMsg);
      logEvent({
        repo: repoPath || undefined,
        functionArea: 'source-control',
        level: 'info',
        operation: 'git-menu',
        message: successMsg,
        endTime,
        durationMs,
      }).catch(() => {});
    } catch (e) {
      const endTime = new Date().toISOString();
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      setFeedback(`Error: ${e}`);
      logEvent({
        repo: repoPath || undefined,
        functionArea: 'source-control',
        level: 'error',
        operation: 'git-menu',
        message: String(e),
        endTime,
        durationMs,
      }).catch(() => {});
    }
    setModal('none');
    setOpen(false);
    setInputValue('');
  };

  const menuItems = [
    { type: 'header' as const, label: 'Branch' },
    {
      label: 'Switch Branch',
      action: async () => { await loadBranches(); setModal('branches'); },
    },
    {
      label: 'Create Branch',
      action: () => { setInputValue(''); setModal('create-branch'); },
    },
    {
      label: 'Delete Branch',
      action: async () => { await loadBranches(); setModal('delete-branch'); },
    },
    { type: 'divider' as const },
    { type: 'header' as const, label: 'Merge & Rebase' },
    {
      label: 'Merge Branch Into Current',
      action: async () => { await loadBranches(); setModal('merge'); },
    },
    {
      label: 'Rebase Onto Branch',
      action: async () => { await loadBranches(); setModal('rebase'); },
    },
    { type: 'divider' as const },
    { type: 'header' as const, label: 'Stash' },
    {
      label: 'Stash Changes',
      action: () => runAndRefresh(() => gitStash(repoPath), 'Changes stashed'),
    },
    {
      label: 'Pop Stash',
      action: () => runAndRefresh(() => gitStashPop(repoPath), 'Stash applied'),
    },
    { type: 'divider' as const },
    { type: 'header' as const, label: 'Remote' },
    {
      label: 'Fetch All',
      action: () => runAndRefresh(() => gitFetch(repoPath), 'Fetched all remotes'),
    },
    { type: 'divider' as const },
    { type: 'header' as const, label: 'Undo' },
    {
      label: 'Undo Last Commit (soft)',
      action: () => {
        setConfirmAction({
          label: 'Undo Last Commit',
          description: 'This will soft-reset HEAD~1. Your changes will be kept as staged.',
          action: () => gitUndoLastCommit(repoPath),
        });
        setModal('confirm');
      },
    },
    {
      label: 'Revert Last Push',
      action: () => {
        setConfirmAction({
          label: 'Revert Last Push',
          description: 'This creates a new commit that reverses the last commit. Safe for shared branches.',
          action: () => gitRevertLastPush(repoPath),
        });
        setModal('confirm');
      },
    },
  ];

  const branchListModal = (title: string, onSelect: (name: string) => void) => (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>{title}</div>
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {branches.filter(b => !b.current).map((b) => (
            <div
              key={b.name}
              onClick={() => onSelect(b.name)}
              style={branchItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{b.name}</span>
              {b.remote && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{b.remote}</span>}
            </div>
          ))}
          {branches.filter(b => !b.current).length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-tertiary)', textAlign: 'center', fontSize: 13 }}>
              No other branches
            </div>
          )}
        </div>
        <div style={modalFooterStyle}>
          <button onClick={() => { setModal('none'); setOpen(false); }} style={cancelBtnStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="More actions"
        style={{
          background: 'var(--border-primary)',
          border: '1px solid var(--border-secondary)',
          color: 'var(--text-primary)',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {open && modal === 'none' && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          width: 240,
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {menuItems.map((item, i) => {
            if ('type' in item && item.type === 'divider') {
              return <div key={i} style={{ borderTop: '1px solid var(--border-primary)', margin: '4px 0' }} />;
            }
            if ('type' in item && item.type === 'header') {
              return (
                <div key={i} style={{
                  padding: '6px 12px 2px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {item.label}
                </div>
              );
            }
            return (
              <div
                key={i}
                onClick={() => 'action' in item && item.action?.()}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {item.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Branch picker modals */}
      {modal === 'branches' && branchListModal('Switch Branch', (name) =>
        runAndRefresh(() => gitSwitchBranch(repoPath, name), `Switched to ${name}`)
      )}

      {modal === 'merge' && branchListModal('Merge Branch Into Current', (name) =>
        runAndRefresh(() => gitMerge(repoPath, name), `Merged ${name}`)
      )}

      {modal === 'rebase' && branchListModal('Rebase Onto Branch', (name) =>
        runAndRefresh(() => gitRebase(repoPath, name), `Rebased onto ${name}`)
      )}

      {modal === 'delete-branch' && branchListModal('Delete Branch', (name) => {
        setConfirmAction({
          label: `Delete branch "${name}"`,
          description: 'This will delete the local branch. Use force-delete if it has unmerged changes.',
          action: () => gitDeleteBranch(repoPath, name, false),
        });
        setModal('confirm');
      })}

      {/* Create branch modal */}
      {modal === 'create-branch' && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>Create New Branch</div>
            <div style={{ padding: '12px 16px' }}>
              <input
                autoFocus
                type="text"
                placeholder="Branch name..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValue.trim()) {
                    runAndRefresh(
                      () => gitCreateBranch(repoPath, inputValue.trim()),
                      `Created and switched to ${inputValue.trim()}`
                    );
                  }
                }}
                style={inputStyle}
              />
            </div>
            <div style={modalFooterStyle}>
              <button onClick={() => { setModal('none'); setOpen(false); }} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => {
                  if (inputValue.trim()) {
                    runAndRefresh(
                      () => gitCreateBranch(repoPath, inputValue.trim()),
                      `Created and switched to ${inputValue.trim()}`
                    );
                  }
                }}
                style={confirmBtnStyle}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {modal === 'confirm' && confirmAction && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>{confirmAction.label}</div>
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {confirmAction.description}
            </div>
            <div style={modalFooterStyle}>
              <button onClick={() => { setModal('none'); setOpen(false); setConfirmAction(null); }} style={cancelBtnStyle}>
                Cancel
              </button>
              <button
                onClick={() => runAndRefresh(confirmAction.action, `${confirmAction.label} completed`)}
                style={{ ...confirmBtnStyle, background: '#da3633' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          background: feedback.startsWith('Error') ? '#3d1f1f' : 'var(--bg-active)',
          border: `1px solid ${feedback.startsWith('Error') ? '#6e3030' : 'var(--accent-secondary)'}`,
          borderRadius: 8,
          padding: '8px 16px',
          color: 'var(--text-primary)',
          fontSize: 13,
          zIndex: 200,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {feedback}
        </div>
      )}
    </div>
  );
}

// Shared styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 10,
  width: 360,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-primary)',
};

const modalFooterStyle: React.CSSProperties = {
  padding: '8px 16px 12px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  borderTop: '1px solid var(--border-primary)',
};

const branchItemStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: "'Cascadia Code', 'Consolas', monospace",
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  fontFamily: "'Cascadia Code', 'Consolas', monospace",
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-secondary)',
  color: 'var(--text-secondary)',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
  background: '#238636',
  border: 'none',
  color: '#fff',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
