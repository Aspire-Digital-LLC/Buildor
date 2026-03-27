import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '@/stores';

export function ProjectSwitcher() {
  const {
    projects,
    activeProject,
    isLoading,
    error,
    addProject,
    removeProject,
    setActiveProject,
    loadProjects,
  } = useProjectStore();

  // Always refresh projects when this component mounts
  useEffect(() => {
    loadProjects();
  }, []);
  const [removing, setRemoving] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddProject = async () => {
    setAddError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    });

    if (selected && typeof selected === 'string') {
      // Derive name from folder
      const parts = selected.replace(/\\/g, '/').split('/');
      const name = parts[parts.length - 1] || 'unnamed';
      try {
        await addProject(name, selected);
      } catch (e) {
        setAddError(String(e));
      }
    }
  };

  const handleRemove = async (name: string) => {
    if (removing === name) {
      // Second click confirms
      await removeProject(name);
      setRemoving(null);
    } else {
      setRemoving(name);
      // Auto-cancel after 3 seconds
      setTimeout(() => setRemoving(null), 3000);
    }
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: 18 }}>Projects</h2>
        <button
          onClick={handleAddProject}
          style={{
            background: '#238636',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Project
        </button>
      </div>

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

      {addError && (
        <div style={{
          background: '#3d1f1f',
          border: '1px solid #6e3030',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          color: '#f88',
          fontSize: 13,
        }}>
          {addError}
        </div>
      )}

      {isLoading && (
        <div style={{ color: '#8b949e', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Loading projects...
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div style={{
          color: '#8b949e',
          fontSize: 14,
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed #30363d',
          borderRadius: 8,
        }}>
          No projects yet. Click "+ Project" to add a git repository.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((project) => {
          const isActive = activeProject?.name === project.name;
          const isConfirmingRemove = removing === project.name;

          return (
            <div
              key={project.name}
              onClick={() => setActiveProject(project)}
              style={{
                background: isActive ? '#1a2332' : '#161b22',
                border: `1px solid ${isActive ? '#1f6feb' : '#21262d'}`,
                borderRadius: 8,
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    {isActive && (
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#3fb950',
                        flexShrink: 0,
                      }} />
                    )}
                    <span style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#e0e0e0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {project.name}
                    </span>
                    {project.currentBranch && (
                      <span style={{
                        fontSize: 11,
                        color: '#8b949e',
                        background: '#21262d',
                        padding: '1px 6px',
                        borderRadius: 10,
                        flexShrink: 0,
                      }}>
                        {project.currentBranch}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: '#6e7681',
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {project.repoPath}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(project.name);
                  }}
                  style={{
                    background: isConfirmingRemove ? '#da3633' : 'transparent',
                    color: isConfirmingRemove ? '#fff' : '#6e7681',
                    border: isConfirmingRemove ? '1px solid #da3633' : '1px solid transparent',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {isConfirmingRemove ? 'Confirm' : '\u00d7'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
