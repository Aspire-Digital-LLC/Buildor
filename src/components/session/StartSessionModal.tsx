import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '@/stores';
import { getBranchesForRepo, createSession } from '@/utils/commands/worktree';
import { generateSlug as generateSlugViaHaiku } from '@/utils/commands/claude';
import { logEvent } from '@/utils/commands/logging';
import type { Project, SessionInfo, SessionType } from '@/types';

interface StartSessionModalProps {
  onClose: () => void;
  onSessionCreated: (session: SessionInfo) => void;
}

const sessionTypes: { value: SessionType; label: string; color: string }[] = [
  { value: 'feature', label: 'Feature', color: '#3fb950' },
  { value: 'bug', label: 'Bug', color: '#f85149' },
  { value: 'issue', label: 'Issue', color: '#d29922' },
  { value: 'documentation', label: 'Documentation', color: '#58a6ff' },
  { value: 'release', label: 'Release', color: '#a371f7' },
];

export function StartSessionModal({ onClose, onSessionCreated }: StartSessionModalProps) {
  const { projects, loadProjects } = useProjectStore();

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchSearch, setBranchSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('feature');
  const [hasIssue, setHasIssue] = useState(false);
  const [issueNumber, setIssueNumber] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  // Haiku slug state
  const [aiSlug, setAiSlug] = useState<string | null>(null);
  const [aiSlugSource, setAiSlugSource] = useState<string>('');
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [isEditingSlug, setIsEditingSlug] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // Auto-select first project if only one
  useEffect(() => {
    if (projects.length === 1 && !selectedProject) {
      setSelectedProject(projects[0]);
    }
  }, [projects]);

  // Fetch branches when project changes
  useEffect(() => {
    if (!selectedProject) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    getBranchesForRepo(selectedProject.repoPath)
      .then((b) => {
        setBranches(b);
        // Auto-select main/master if available
        const defaultBranch = b.find((br) => br === 'main') || b.find((br) => br === 'master') || '';
        setSelectedBranch(defaultBranch);
        setBranchSearch(defaultBranch);
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [selectedProject]);

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase())
  );

  // Debounced Haiku slug generation — 1 second after user stops typing
  const slugInput = hasIssue ? (issueNumber ? `Issue #${issueNumber}` : '') : description;

  useEffect(() => {
    // Skip if user has manually overridden the slug
    if (slugOverride !== null) return;

    if (!slugInput.trim()) {
      setAiSlug(null);
      setAiSlugSource('');
      return;
    }

    // Don't re-fetch if source hasn't changed
    if (slugInput === aiSlugSource && aiSlug) return;

    const timeout = setTimeout(async () => {
      setIsGeneratingSlug(true);
      const startTime = new Date().toISOString();
      try {
        const result = await generateSlugViaHaiku(slugInput);
        const endTime = new Date().toISOString();
        const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        setAiSlug(result);
        setAiSlugSource(slugInput);
        logEvent({
          functionArea: 'worktree',
          level: 'info',
          operation: 'generate-slug',
          message: `Generated slug: "${result}" from: "${slugInput}"`,
          endTime,
          durationMs,
        }).catch(() => {});
      } catch (e) {
        const endTime = new Date().toISOString();
        const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        logEvent({
          functionArea: 'worktree',
          level: 'error',
          operation: 'generate-slug',
          message: `Slug generation failed: ${String(e)}`,
          details: `Input: "${slugInput}"`,
          endTime,
          durationMs,
        }).catch(() => {});
      }
      setIsGeneratingSlug(false);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [slugInput]);

  const handleCreate = useCallback(async () => {
    if (!selectedProject || !selectedBranch) return;

    setIsCreating(true);
    setError(null);

    // Use manual override if set, otherwise use cached/fresh Haiku slug
    let slug: string;
    if (slugOverride !== null) {
      slug = slugOverride;
    } else {
      const currentSlugInput = hasIssue ? `Issue #${issueNumber}` : description;
      if (aiSlug && aiSlugSource === currentSlugInput) {
        slug = aiSlug;
      } else {
        try {
          slug = await generateSlugViaHaiku(currentSlugInput);
        } catch {
          slug = currentSlugInput
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 40) || 'session';
        }
      }
    }

    const startTime = new Date().toISOString();
    try {
      const session = await createSession({
        projectName: selectedProject.name,
        repoPath: selectedProject.repoPath,
        baseBranch: selectedBranch,
        sessionType,
        slug,
        issueNumber: hasIssue && issueNumber ? issueNumber : undefined,
      });

      const endTime = new Date().toISOString();
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      logEvent({
        sessionId: session.sessionId,
        repo: selectedProject.repoPath,
        functionArea: 'worktree',
        level: 'info',
        operation: 'create-session',
        message: `Created session: ${session.branchName} (${session.sessionType})`,
        endTime,
        durationMs,
      }).catch(() => {});

      setCreatedSession(session);
      onSessionCreated(session);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      logEvent({
        repo: selectedProject.repoPath,
        functionArea: 'worktree',
        level: 'error',
        operation: 'create-session',
        message: `Failed to create session: ${msg}`,
      }).catch(() => {});
    }
    setIsCreating(false);
  }, [selectedProject, selectedBranch, sessionType, hasIssue, issueNumber, description]);

  // Success screen
  if (createdSession) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, width: 480 }}>
          <div style={modalHeaderStyle}>
            <span style={{ color: '#3fb950' }}>Session Created</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>Branch</div>
              <div style={{ fontSize: 14, color: '#e0e0e0', fontFamily: "'Cascadia Code', monospace" }}>
                {createdSession.branchName}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>Worktree</div>
              <div style={{ fontSize: 12, color: '#8b949e', fontFamily: "'Cascadia Code', monospace" }}>
                {createdSession.worktreePath}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                <span style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: '#21262d',
                  color: sessionTypes.find((t) => t.value === createdSession.sessionType)?.color || '#8b949e',
                }}>
                  {createdSession.sessionType}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>Base</div>
                <span style={{ fontSize: 12, color: '#8b949e' }}>{createdSession.baseBranch}</span>
              </div>
              {createdSession.issueNumber && (
                <div>
                  <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>Issue</div>
                  <span style={{ fontSize: 12, color: '#58a6ff' }}>#{createdSession.issueNumber}</span>
                </div>
              )}
            </div>
          </div>
          <div style={modalFooterStyle}>
            <button onClick={onClose} style={primaryBtnStyle}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form
  const canCreate = selectedProject && selectedBranch && (hasIssue ? issueNumber.trim() : description.trim());

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, width: 520 }}>
        <div style={modalHeaderStyle}>Start New Session</div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflow: 'auto' }}>
          {/* Project */}
          <div>
            <label style={labelStyle}>Project</label>
            <select
              value={selectedProject?.name || ''}
              onChange={(e) => {
                const p = projects.find((pr) => pr.name === e.target.value);
                setSelectedProject(p || null);
              }}
              style={selectStyle}
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Base Branch */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Base Branch</label>
            <input
              type="text"
              value={branchSearch}
              onChange={(e) => {
                setBranchSearch(e.target.value);
                setShowBranchDropdown(true);
              }}
              onFocus={() => setShowBranchDropdown(true)}
              placeholder={loadingBranches ? 'Loading branches...' : 'Search branches...'}
              disabled={!selectedProject || loadingBranches}
              style={inputStyle}
            />
            {showBranchDropdown && filteredBranches.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '0 0 6px 6px',
                maxHeight: 200,
                overflow: 'auto',
                zIndex: 10,
              }}>
                {filteredBranches.slice(0, 20).map((b) => (
                  <div
                    key={b}
                    onClick={() => {
                      setSelectedBranch(b);
                      setBranchSearch(b);
                      setShowBranchDropdown(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 13,
                      color: b === selectedBranch ? '#58a6ff' : '#e0e0e0',
                      cursor: 'pointer',
                      fontFamily: "'Cascadia Code', monospace",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#1c2128'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Type */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sessionTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSessionType(t.value)}
                  style={{
                    background: sessionType === t.value ? '#1a2332' : '#0d1117',
                    border: `1px solid ${sessionType === t.value ? t.color : '#30363d'}`,
                    color: sessionType === t.value ? t.color : '#8b949e',
                    borderRadius: 6,
                    padding: '5px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: sessionType === t.value ? 600 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* GitHub Issue Toggle */}
          <div>
            <label style={labelStyle}>Have a GitHub issue number?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setHasIssue(false)}
                style={{
                  background: !hasIssue ? '#1a2332' : '#0d1117',
                  border: `1px solid ${!hasIssue ? '#58a6ff' : '#30363d'}`,
                  color: !hasIssue ? '#58a6ff' : '#8b949e',
                  borderRadius: 6,
                  padding: '5px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: !hasIssue ? 600 : 400,
                }}
              >
                No
              </button>
              <button
                onClick={() => setHasIssue(true)}
                style={{
                  background: hasIssue ? '#1a2332' : '#0d1117',
                  border: `1px solid ${hasIssue ? '#58a6ff' : '#30363d'}`,
                  color: hasIssue ? '#58a6ff' : '#8b949e',
                  borderRadius: 6,
                  padding: '5px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: hasIssue ? 600 : 400,
                }}
              >
                Yes
              </button>
            </div>
          </div>

          {/* Description or Issue Number */}
          {hasIssue ? (
            <div>
              <label style={labelStyle}>Issue Number</label>
              <input
                type="text"
                value={issueNumber}
                onChange={(e) => setIssueNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="#123"
                style={inputStyle}
              />
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description for branch name..."
                style={inputStyle}
              />
            </div>
          )}

          {/* Preview */}
          {selectedProject && selectedBranch && (
            <div style={{
              background: '#0d1117',
              border: '1px solid #21262d',
              borderRadius: 6,
              padding: '8px 12px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase' }}>Branch Preview</span>
                {!isEditingSlug ? (
                  <button
                    onClick={() => {
                      setIsEditingSlug(true);
                      setSlugOverride(aiSlug || '');
                    }}
                    title="Edit slug manually"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#6e7681',
                      cursor: 'pointer',
                      padding: '0 2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsEditingSlug(false);
                      setSlugOverride(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#6e7681',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    Use AI
                  </button>
                )}
              </div>
              {isEditingSlug ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <span style={{ fontSize: 13, color: '#58a6ff', fontFamily: "'Cascadia Code', monospace" }}>
                    {sessionType}/{selectedBranch}/{hasIssue && issueNumber ? `${issueNumber}/` : ''}
                  </span>
                  <input
                    autoFocus
                    type="text"
                    value={slugOverride || ''}
                    onChange={(e) => setSlugOverride(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                    )}
                    placeholder="my-slug"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #30363d',
                      color: '#d29922',
                      fontSize: 13,
                      fontFamily: "'Cascadia Code', monospace",
                      outline: 'none',
                      padding: '0 2px',
                      width: 160,
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#58a6ff', fontFamily: "'Cascadia Code', monospace" }}>
                  {sessionType}/{selectedBranch}/{hasIssue && issueNumber ? `${issueNumber}/` : ''}
                  {isGeneratingSlug ? (
                    <span style={{ color: '#6e7681', fontStyle: 'italic' }}>generating...</span>
                  ) : aiSlug ? (
                    <span style={{ color: '#3fb950' }}>{aiSlug}</span>
                  ) : (
                    <span style={{ color: '#6e7681', fontStyle: 'italic' }}>{'<type to generate>'}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: '#3d1f1f',
              border: '1px solid #6e3030',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#f88',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={modalFooterStyle}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            style={{
              ...primaryBtnStyle,
              opacity: canCreate && !isCreating ? 1 : 0.5,
              cursor: canCreate && !isCreating ? 'pointer' : 'default',
            }}
          >
            {isCreating ? 'Creating session...' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 12,
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '14px 20px',
  fontSize: 16,
  fontWeight: 600,
  color: '#e0e0e0',
  borderBottom: '1px solid #21262d',
};

const modalFooterStyle: React.CSSProperties = {
  padding: '12px 20px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  borderTop: '1px solid #21262d',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#8b949e',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 6,
  color: '#e0e0e0',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  background: '#21262d',
  border: '1px solid #30363d',
  color: '#8b949e',
  borderRadius: 6,
  padding: '7px 16px',
  fontSize: 13,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#238636',
  border: 'none',
  color: '#fff',
  borderRadius: 6,
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
