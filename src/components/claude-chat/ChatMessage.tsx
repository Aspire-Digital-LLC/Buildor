import { useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'permission_request';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  toolUseId?: string;
  requestId?: string;
  isError?: boolean;
}

export interface ParsedMessage {
  role: 'assistant' | 'user' | 'system' | 'tool';
  content: ChatContent[];
  model?: string;
  costUsd?: number;
  durationMs?: number;
  isResult?: boolean;
}

interface ChatMessageProps {
  message: ParsedMessage;
  sessionId?: string;
  isVerbose: boolean;
}

const toolIcons: Record<string, string> = {
  Edit: '✏️',
  Read: '📄',
  Write: '📝',
  Bash: '💻',
  Glob: '🔍',
  Grep: '🔎',
  WebSearch: '🌐',
  WebFetch: '🌐',
  Agent: '🤖',
  TodoWrite: '📋',
};

export function ChatMessage({ message, isVerbose, sessionId }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div style={{ padding: '8px 12px', marginBottom: 4 }}>
        <div style={{
          fontSize: 13,
          color: '#58a6ff',
          fontWeight: 600,
          marginBottom: 4,
        }}>You</div>
        <div style={{ fontSize: 13, color: '#e0e0e0' }}>{message.content[0]?.text || ''}</div>
      </div>
    );
  }

  if (message.role === 'system') {
    return (
      <div style={{
        padding: '4px 12px',
        fontSize: 12,
        color: '#6e7681',
        fontStyle: 'italic',
      }}>
        {message.content[0]?.text || ''}
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 12px', marginBottom: 4 }}>
      {message.content.map((block, i) => {
        if (block.type === 'text' && block.text) {
          return (
            <div key={i} className="chat-markdown" style={{ fontSize: 13, color: '#e0e0e0', lineHeight: 1.6 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const isInline = !className;
                    if (isInline) {
                      return <code style={{
                        background: '#21262d',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: 12,
                        fontFamily: "'Cascadia Code', 'Consolas', monospace",
                        color: '#e0e0e0',
                      }} {...props}>{children}</code>;
                    }
                    const lang = className?.replace('language-', '') || '';
                    return (
                      <div style={{
                        background: '#0d1117',
                        border: '1px solid #21262d',
                        borderRadius: 6,
                        margin: '8px 0',
                        overflow: 'hidden',
                      }}>
                        {lang && (
                          <div style={{
                            padding: '4px 10px',
                            fontSize: 10,
                            color: '#6e7681',
                            borderBottom: '1px solid #21262d',
                            textTransform: 'uppercase',
                          }}>{lang}</div>
                        )}
                        <pre style={{
                          padding: '10px 12px',
                          margin: 0,
                          overflow: 'auto',
                          fontSize: 12,
                          fontFamily: "'Cascadia Code', 'Consolas', monospace",
                          color: '#e0e0e0',
                          lineHeight: 1.5,
                        }}>
                          <code {...props}>{children}</code>
                        </pre>
                      </div>
                    );
                  },
                  table({ children }) {
                    return (
                      <table style={{
                        borderCollapse: 'collapse',
                        margin: '8px 0',
                        fontSize: 12,
                        width: '100%',
                      }}>{children}</table>
                    );
                  },
                  th({ children }) {
                    return <th style={{
                      border: '1px solid #30363d',
                      padding: '6px 10px',
                      background: '#21262d',
                      color: '#e0e0e0',
                      textAlign: 'left',
                      fontSize: 12,
                    }}>{children}</th>;
                  },
                  td({ children }) {
                    return <td style={{
                      border: '1px solid #21262d',
                      padding: '6px 10px',
                      color: '#adbac7',
                      fontSize: 12,
                    }}>{children}</td>;
                  },
                  a({ href, children }) {
                    return <a href={href} style={{ color: '#58a6ff' }} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                }}
              >{block.text}</ReactMarkdown>
            </div>
          );
        }

        if (block.type === 'tool_use') {
          const icon = toolIcons[block.name || ''] || '🔧';
          const isEdit = block.name === 'Edit';
          return (
            <ToolCard key={i} icon={icon} name={block.name || 'Tool'}>
              {isEdit && block.input ? (
                <EditDiff input={block.input} />
              ) : isVerbose && block.input ? (
                <pre style={{
                  fontSize: 11,
                  color: '#8b949e',
                  fontFamily: "'Cascadia Code', monospace",
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {JSON.stringify(block.input, null, 2)}
                </pre>
              ) : (
                <span style={{ fontSize: 12, color: '#8b949e' }}>
                  {block.name === 'Bash' ? (block.input as any)?.command :
                   block.name === 'Read' ? (block.input as any)?.file_path :
                   block.name === 'Write' ? (block.input as any)?.file_path :
                   block.name === 'Glob' ? (block.input as any)?.pattern :
                   block.name === 'Grep' ? (block.input as any)?.pattern :
                   JSON.stringify(block.input).slice(0, 100)}
                </span>
              )}
            </ToolCard>
          );
        }

        if (block.type === 'tool_result') {
          if (!isVerbose) return null;
          return (
            <div key={i} style={{
              background: '#0d1117',
              border: '1px solid #21262d',
              borderRadius: 6,
              padding: '8px 10px',
              margin: '4px 0',
              fontSize: 12,
              color: block.isError ? '#f85149' : '#8b949e',
              fontFamily: "'Cascadia Code', monospace",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {block.content || '(empty)'}
            </div>
          );
        }

        if (block.type === 'thinking') {
          if (!isVerbose) return null;
          return (
            <details key={i} style={{ margin: '4px 0' }}>
              <summary style={{ fontSize: 11, color: '#6e7681', cursor: 'pointer' }}>Thinking...</summary>
              <div style={{
                fontSize: 12,
                color: '#6e7681',
                padding: '8px',
                fontStyle: 'italic',
                whiteSpace: 'pre-wrap',
              }}>{block.text}</div>
            </details>
          );
        }

        if (block.type === 'permission_request') {
          return (
            <PermissionCard
              key={i}
              toolName={block.name || 'Unknown'}
              description={block.text || ''}
              input={block.input}
              toolUseId={block.toolUseId || ''}
              requestId={block.requestId || ''}
              sessionId={sessionId}
            />
          );
        }

        return null;
      })}

      {/* Cost badge */}
      {message.costUsd !== undefined && message.costUsd > 0 && (
        <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>
          ${message.costUsd.toFixed(4)} · {message.durationMs ? `${(message.durationMs / 1000).toFixed(1)}s` : ''}
        </div>
      )}
    </div>
  );
}

function ToolCard({ icon, name, children }: {
  icon: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <div style={{
      background: '#161b22',
      border: '1px solid #21262d',
      borderRadius: 6,
      margin: '6px 0',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: '#8b949e',
        borderBottom: '1px solid #21262d',
      }}>
        <span>{icon}</span>
        <span style={{ fontWeight: 600, color: '#c9d1d9' }}>{name}</span>
      </div>
      <div style={{ padding: '6px 10px' }}>
        {children}
      </div>
    </div>
  );
}

function PermissionCard({ toolName, description, input, toolUseId, requestId, sessionId }: {
  toolName: string;
  description: string;
  input?: Record<string, unknown>;
  toolUseId: string;
  requestId: string;
  sessionId?: string;
}) {
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(null);

  const handleResponse = async (approved: boolean) => {
    if (!sessionId || resolved) return;
    try {
      const { respondToPermission } = await import('@/utils/commands/claude');
      await respondToPermission(sessionId, requestId, approved, approved ? input : undefined);
      setResolved(approved ? 'approved' : 'denied');

      const { buildorEvents } = await import('@/utils/buildorEvents');
      buildorEvents.emit('permission-resolved', {
        requestId,
        toolUseId,
        toolName,
        approved,
      }, sessionId);
    } catch {
      // silently fail
    }
  };

  const icon = toolIcons[toolName] || '🔧';

  return (
    <div style={{
      background: '#1a1a2e',
      border: `1px solid ${resolved === 'approved' ? '#3fb950' : resolved === 'denied' ? '#f85149' : '#d29922'}`,
      borderRadius: 8,
      margin: '8px 0',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid #21262d',
      }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#d29922' }}>
          Permission Required
        </span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{toolName}</span>
        </div>
        <div style={{
          fontSize: 12,
          color: '#adbac7',
          marginBottom: 8,
          fontFamily: "'Cascadia Code', monospace",
        }}>
          {description}
        </div>
        {input && (toolName === 'Bash') && (
          <div style={{
            background: '#0d1117',
            border: '1px solid #21262d',
            borderRadius: 4,
            padding: '6px 8px',
            fontSize: 12,
            color: '#8b949e',
            fontFamily: "'Cascadia Code', monospace",
            marginBottom: 8,
            whiteSpace: 'pre-wrap',
          }}>
            $ {(input as any).command}
          </div>
        )}
        {resolved ? (
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: resolved === 'approved' ? '#3fb950' : '#f85149',
          }}>
            {resolved === 'approved' ? '✓ Approved' : '✗ Denied'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleResponse(true)}
              style={{
                background: '#238636',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
            <button
              onClick={async () => {
                // Approve this request + save rule to .claude/settings.local.json
                await handleResponse(true);
                if (sessionId) {
                  try {
                    const { addPermissionRule } = await import('@/utils/commands/claude');
                    // Build permission rule matching Claude Code's format
                    let rule = toolName;
                    if (toolName === 'Bash' && input?.command) {
                      // Extract the base command for the wildcard pattern
                      const cmd = String(input.command);
                      const baseCmd = cmd.split(' ')[0];
                      rule = `Bash(${baseCmd}:*)`;
                    }
                    await addPermissionRule(sessionId, rule);
                  } catch {
                    // Best-effort — don't block the approval
                  }
                }
              }}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Always Allow
            </button>
            <button
              onClick={() => handleResponse(false)}
              style={{
                background: '#21262d',
                border: '1px solid #da3633',
                color: '#f85149',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditDiff({ input }: { input: Record<string, unknown> }) {
  const filePath = input.file_path as string || '';
  const oldStr = input.old_string as string || '';
  const newStr = input.new_string as string || '';

  return (
    <div>
      <div style={{ fontSize: 11, color: '#6e7681', marginBottom: 4, fontFamily: "'Cascadia Code', monospace" }}>
        {filePath}
      </div>
      {oldStr && (
        <div style={{
          background: '#3d1f1f',
          padding: '4px 8px',
          borderRadius: 4,
          marginBottom: 2,
          fontSize: 12,
          fontFamily: "'Cascadia Code', monospace",
          color: '#f85149',
          whiteSpace: 'pre-wrap',
          maxHeight: 120,
          overflow: 'auto',
        }}>
          {oldStr.split('\n').map((line, i) => (
            <div key={i}>- {line}</div>
          ))}
        </div>
      )}
      {newStr && (
        <div style={{
          background: '#1a2e1a',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "'Cascadia Code', monospace",
          color: '#3fb950',
          whiteSpace: 'pre-wrap',
          maxHeight: 120,
          overflow: 'auto',
        }}>
          {newStr.split('\n').map((line, i) => (
            <div key={i}>+ {line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
