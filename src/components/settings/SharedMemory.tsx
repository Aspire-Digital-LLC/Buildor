import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { logEvent } from '@/utils/commands/logging';

export function SharedMemory() {
  const [repoPath, setRepoPath] = useState<string | null>(null);

  // TODO: Load from config
  useEffect(() => {
    // placeholder
  }, []);

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Shared Skills/Flows Repository',
    });

    if (selected && typeof selected === 'string') {
      setRepoPath(selected);
      logEvent({
        functionArea: 'system',
        level: 'info',
        operation: 'set-shared-memory',
        message: `Shared memory repo set to: ${selected}`,
      }).catch(() => {});
      // TODO: Save to config
    }
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 8px', color: '#e0e0e0', fontSize: 18 }}>Shared Memory</h2>
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 20 }}>
        Point to a local git repository that holds your team's shared skills, flows, and configurations.
        This repo will be synced automatically.
      </p>

      {repoPath ? (
        <div style={{
          background: '#161b22',
          border: '1px solid #21262d',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 }}>
            Repository Path
          </div>
          <div style={{
            fontSize: 13,
            color: '#e0e0e0',
            fontFamily: "'Cascadia Code', monospace",
            marginBottom: 8,
          }}>
            {repoPath}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleSelectFolder}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Change
            </button>
            <button
              onClick={() => setRepoPath(null)}
              style={{
                background: '#21262d',
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
      ) : (
        <div style={{
          border: '1px dashed #30363d',
          borderRadius: 8,
          padding: '32px 20px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#6e7681', fontSize: 13, marginBottom: 12 }}>
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
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', marginBottom: 8 }}>
          Expected Structure
        </div>
        <div style={{
          background: '#0d1117',
          border: '1px solid #21262d',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: "'Cascadia Code', monospace",
          color: '#8b949e',
          lineHeight: 1.8,
        }}>
          {'shared-repo/\n├── .buildor.json     # branch config\n├── flows/            # flow definitions\n│   ├── develop.json\n│   └── hotfix.json\n└── skills/           # skill prompts\n    ├── commit.md\n    └── review.md'}
        </div>
      </div>
    </div>
  );
}
