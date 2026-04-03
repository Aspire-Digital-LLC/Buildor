import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentOutputBlock } from './AgentOutputBlock';

export interface ChatContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'permission_request' | 'image';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  toolUseId?: string;
  requestId?: string;
  isError?: boolean;
  /** data URL for image thumbnails in user messages */
  imageDataUrl?: string;
  /** file path on disk for persisted images */
  imagePath?: string;
}

export interface ParsedMessage {
  role: 'assistant' | 'user' | 'system' | 'system-event' | 'tool';
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
  activePermissionId?: string | null;
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

export function ChatMessage({ message, isVerbose, sessionId, activePermissionId }: ChatMessageProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (message.role === 'user') {
    const imageBlocks = message.content.filter((b) => b.type === 'image' && b.imageDataUrl);
    const textBlocks = message.content.filter((b) => b.type === 'text' && b.text);
    const textContent = textBlocks.map((b) => b.text).join('\n');

    return (
      <>
        <div style={{ padding: '8px 12px', marginBottom: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            maxWidth: '80%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 12,
            borderBottomRightRadius: 4,
            padding: '8px 14px',
          }}>
            {imageBlocks.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: textContent ? 8 : 0 }}>
                {imageBlocks.map((img, i) => (
                  <div
                    key={i}
                    onClick={() => setLightboxSrc(img.imageDataUrl!)}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: '1px solid var(--border-secondary)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title={img.text || 'Image'}
                  >
                    <img
                      src={img.imageDataUrl}
                      alt={img.text || 'Attached image'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ))}
              </div>
            )}
            {textContent && (
              <div style={{
                fontSize: 13,
                color: 'var(--accent-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>{textContent}</div>
            )}
          </div>
        </div>
        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </>
    );
  }

  if (message.role === 'system') {
    if (!isVerbose) {
      // In conversation mode, system messages fade out after 5s
      return <FadingMessage>{message.content[0]?.text || ''}</FadingMessage>;
    }
    return (
      <div style={{
        padding: '4px 12px',
        fontSize: 12,
        color: 'var(--text-tertiary)',
        fontStyle: 'italic',
      }}>
        {message.content[0]?.text || ''}
      </div>
    );
  }

  // System-event messages: render as subtle inline divider markers
  if (message.role === 'system-event') {
    const raw = message.content[0]?.text || '{}';
    let eventData: { event_type?: string; skillName?: string; agentName?: string; durationMs?: number; sourceSkill?: string; details?: string; resultSummary?: string } = {};
    try { eventData = JSON.parse(raw); } catch { /* ignore */ }

    const eventType = eventData.event_type || 'unknown';

    // Agent completed/failed with output — render as AgentOutputBlock
    if ((eventType === 'agent-completed' || eventType === 'agent-failed') && eventData.agentName) {
      return (
        <AgentOutputBlock
          agentName={eventData.agentName}
          status={eventType === 'agent-completed' ? 'completed' : 'failed'}
          summary={eventData.resultSummary || eventData.details || ''}
          durationMs={eventData.durationMs}
        />
      );
    }

    let icon = '';
    let label = '';

    if (eventType === 'skill-activated') {
      icon = '\u2B50'; // star
      label = `Skill activated: ${eventData.skillName || 'unknown'}`;
    } else if (eventType === 'skill-deactivated') {
      icon = '\u2B50';
      label = `Skill deactivated: ${eventData.skillName || 'unknown'}`;
    } else if (eventType === 'skill-run') {
      icon = '\u26A1'; // lightning
      label = `Skill invoked: ${eventData.skillName || 'unknown'}`;
    } else if (eventType === 'agent-started') {
      icon = '\uD83E\uDD16'; // robot
      label = `Agent started: ${eventData.agentName || 'unknown'}${eventData.sourceSkill ? ` (from ${eventData.sourceSkill})` : ''}`;
    } else {
      label = eventType;
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        margin: '2px 0',
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{icon}</span>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
      </div>
    );
  }

  // In conversation mode, skip messages that have no visible content (only tools, no text)
  if (!isVerbose) {
    const hasText = message.content.some((b) => b.type === 'text' && b.text);
    const hasPending = message.content.some((b) => b.type === 'permission_request');
    if (!hasText && !hasPending) return null;
  }

  return (
    <div style={{ padding: '8px 12px', marginBottom: 4, maxWidth: '90%' }}>
      {message.content.map((block, i) => {
        if (block.type === 'text' && block.text) {
          // In conversation mode, put assistant text in a left-aligned bubble
          const bubbleStyle = !isVerbose ? {
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            borderBottomLeftRadius: 4,
            padding: '10px 16px',
          } : {};
          return (
            <div key={i} style={bubbleStyle}>
            <div className="chat-markdown" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const isInline = !className;
                    if (isInline) {
                      return <code style={{
                        background: 'var(--border-primary)',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: 12,
                        fontFamily: "'Cascadia Code', 'Consolas', monospace",
                        color: 'var(--text-primary)',
                      }} {...props}>{children}</code>;
                    }
                    const lang = className?.replace('language-', '') || '';
                    return (
                      <div style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 6,
                        margin: '8px 0',
                        overflow: 'hidden',
                      }}>
                        {lang && (
                          <div style={{
                            padding: '4px 10px',
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            borderBottom: '1px solid var(--border-primary)',
                            textTransform: 'uppercase',
                          }}>{lang}</div>
                        )}
                        <pre style={{
                          padding: '10px 12px',
                          margin: 0,
                          overflow: 'auto',
                          fontSize: 12,
                          fontFamily: "'Cascadia Code', 'Consolas', monospace",
                          color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-secondary)',
                      padding: '6px 10px',
                      background: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                      textAlign: 'left',
                      fontSize: 12,
                    }}>{children}</th>;
                  },
                  td({ children }) {
                    return <td style={{
                      border: '1px solid var(--border-primary)',
                      padding: '6px 10px',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                    }}>{children}</td>;
                  },
                  a({ href, children }) {
                    return <a href={href} style={{ color: 'var(--accent-primary)' }} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                  ul({ children }) {
                    return <ul style={{ margin: '4px 0', paddingLeft: '1.2em', listStylePosition: 'outside' }}>{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol style={{ margin: '4px 0', paddingLeft: '1.2em', listStylePosition: 'outside' }}>{children}</ol>;
                  },
                  li({ children }) {
                    return <li style={{ marginBottom: 2 }}>{children}</li>;
                  },
                }}
              >{block.text}</ReactMarkdown>
            </div>
            </div>
          );
        }

        if (block.type === 'tool_use') {
          if (!isVerbose) return null;
          const icon = toolIcons[block.name || ''] || '🔧';
          const isEdit = block.name === 'Edit';
          return (
            <ToolCard key={i} icon={icon} name={block.name || 'Tool'}>
              {isEdit && block.input ? (
                <EditDiff input={block.input} />
              ) : isVerbose && block.input ? (
                <pre style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  fontFamily: "'Cascadia Code', monospace",
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {JSON.stringify(block.input, null, 2)}
                </pre>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              padding: '8px 10px',
              margin: '4px 0',
              fontSize: 12,
              color: block.isError ? '#f85149' : 'var(--text-secondary)',
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
              <summary style={{ fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>Thinking...</summary>
              <div style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                padding: '8px',
                fontStyle: 'italic',
                whiteSpace: 'pre-wrap',
              }}>{block.text}</div>
            </details>
          );
        }

        if (block.type === 'permission_request') {
          // In conversation mode: only show the active (first unresolved) permission, hide all others
          if (!isVerbose) {
            if (!activePermissionId || block.requestId !== activePermissionId) return null;
          }
          return (
            <PermissionCard
              key={i}
              toolName={block.name || 'Unknown'}
              description={block.text || ''}
              input={block.input}
              toolUseId={block.toolUseId || ''}
              requestId={block.requestId || ''}
              sessionId={sessionId}
              isVerbose={isVerbose}
            />
          );
        }

        return null;
      })}

      {/* Cost badge — verbose only */}
      {isVerbose && message.costUsd !== undefined && message.costUsd > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
          ${message.costUsd.toFixed(4)} · {message.durationMs ? `${(message.durationMs / 1000).toFixed(1)}s` : ''}
        </div>
      )}
    </div>
  );
}

function FadingMessage({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'gone'>('visible');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 4000);
    const t2 = setTimeout(() => setPhase('gone'), 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div style={{
      fontSize: 11,
      color: 'var(--text-tertiary)',
      fontStyle: 'italic',
      overflow: 'hidden',
      transition: 'opacity 1.2s ease-out, max-height 0.8s ease-out, padding 0.8s ease-out, margin 0.8s ease-out',
      opacity: phase === 'fading' ? 0 : 0.7,
      maxHeight: phase === 'fading' ? 0 : 60,
      padding: phase === 'fading' ? '0 12px' : '3px 12px',
      margin: phase === 'fading' ? 0 : undefined,
    }}>
      {children}
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
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
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
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <span>{icon}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
      </div>
      <div style={{ padding: '6px 10px' }}>
        {children}
      </div>
    </div>
  );
}

function PermissionCard({ toolName, description, input, toolUseId, requestId, sessionId, isVerbose }: {
  toolName: string;
  description: string;
  input?: Record<string, unknown>;
  toolUseId: string;
  requestId: string;
  sessionId?: string;
  isVerbose: boolean;
}) {
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(null);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  // In conversation mode, fade out after resolution
  useEffect(() => {
    if (resolved && !isVerbose) {
      const fadeTimer = setTimeout(() => setFading(true), 3000);
      const hideTimer = setTimeout(() => setHidden(true), 4500);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [resolved, isVerbose]);

  if (hidden) return null;

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
      background: 'var(--bg-active)',
      border: `1px solid ${resolved === 'approved' ? '#3fb950' : resolved === 'denied' ? '#f85149' : '#d29922'}`,
      borderRadius: 8,
      margin: '8px 0',
      transition: 'opacity 1.5s ease-out, max-height 0.5s ease-out',
      opacity: fading ? 0 : 1,
      maxHeight: fading ? 0 : 500,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border-primary)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#d29922' }}>
          Permission Required
        </span>
      </div>
      <div style={{ padding: '10px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{toolName}</span>
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 8,
          fontFamily: "'Cascadia Code', monospace",
        }}>
          {description}
        </div>
        {input && (toolName === 'Bash') && (
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: "'Cascadia Code', monospace",
            marginBottom: 8,
            whiteSpace: 'pre-wrap',
          }}>
            $ {(input as any).command}
          </div>
        )}
      </div>
      {/* Action buttons — always visible at bottom */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-primary)', flexShrink: 0 }}>
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
                await handleResponse(true);
                if (sessionId) {
                  try {
                    const { addPermissionRule } = await import('@/utils/commands/claude');
                    let rule = toolName;
                    if (toolName === 'Bash' && input?.command) {
                      const cmd = String(input.command);
                      const baseCmd = cmd.split(' ')[0];
                      rule = `Bash(${baseCmd}:*)`;
                    }
                    await addPermissionRule(sessionId, rule);
                  } catch { /* best-effort */ }
                }
              }}
              style={{
                background: 'var(--border-primary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
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
                background: 'var(--border-primary)',
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

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'pointer',
      }}
    >
      <img
        src={src}
        alt="Preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          cursor: 'default',
        }}
      />
    </div>
  );
}

function EditDiff({ input }: { input: Record<string, unknown> }) {
  const filePath = input.file_path as string || '';
  const oldStr = input.old_string as string || '';
  const newStr = input.new_string as string || '';

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: "'Cascadia Code', monospace" }}>
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
