import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '@/stores';
import { getLanguageStats } from '@/utils/commands/filesystem';
import type { LanguageStat } from '@/types';

export function ProjectSwitcher() {
  const {
    projects,
    isLoading,
    error,
    addProject,
    removeProject,
    loadProjects,
  } = useProjectStore();

  const [removing, setRemoving] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [langStats, setLangStats] = useState<Record<string, LanguageStat[]>>({});

  useEffect(() => {
    loadProjects();
  }, []);

  // Fetch language stats for all projects
  useEffect(() => {
    projects.forEach((p) => {
      if (!langStats[p.name]) {
        getLanguageStats(p.repoPath).then((stats) => {
          setLangStats((prev) => ({ ...prev, [p.name]: stats }));
        }).catch(() => {});
      }
    });
  }, [projects]);

  const handleAddProject = async () => {
    setAddError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    });

    if (selected && typeof selected === 'string') {
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
      await removeProject(name);
      setRemoving(null);
      setLangStats((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } else {
      setRemoving(name);
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {projects.map((project) => {
          const isConfirmingRemove = removing === project.name;
          const stats = langStats[project.name] || [];

          return (
            <div
              key={project.name}
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  onClick={() => handleRemove(project.name)}
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

              {/* Language bar */}
              {stats.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {/* Color bar */}
                  <div style={{
                    display: 'flex',
                    height: 8,
                    borderRadius: 4,
                    overflow: 'hidden',
                    gap: 1,
                  }}>
                    {stats.filter((s) => s.percentage >= 0.5).map((stat) => (
                      <div
                        key={stat.language}
                        title={`${stat.language}: ${stat.percentage.toFixed(1)}%`}
                        style={{
                          width: `${stat.percentage}%`,
                          backgroundColor: stat.color,
                          minWidth: 3,
                        }}
                      />
                    ))}
                  </div>
                  {/* Legend */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                    marginTop: 6,
                  }}>
                    {stats.filter((s) => s.percentage >= 1).map((stat) => (
                      <span
                        key={stat.language}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: stat.color,
                          display: 'inline-block',
                          flexShrink: 0,
                        }} />
                        <span style={{ color: stat.color, fontWeight: 500 }}>
                          {stat.language}
                        </span>
                        <span style={{ color: '#6e7681' }}>
                          {stat.percentage.toFixed(1)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
