import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { startClaudeSession, sendClaudeMessage, stopSession } from '@/utils/commands/claude';
import { useSkillBuilderStore } from '@/stores/skillBuilderStore';
import { parseStreamEvent } from '@/utils/parseClaudeStream';
import { buildorEvents } from '@/utils/buildorEvents';
import type { ChatContent } from '@/components/claude-chat/ChatMessage';

export interface SkillBuilderChatHandle {
  prefillInput: (text: string) => void;
}

const SKILL_BUILDER_MARKER_RE = /-<\*\{([\s\S]*?)\}\*>-/g;

interface SkillUpdateAction {
  action: 'skill_update';
  field: string;
  value: unknown;
}

function buildSkillBuilderPrompt(skillName: string, skillState: Record<string, unknown>): string {
  return `You are the Buildor Skill Builder assistant. Your ONLY purpose is helping the user create and edit Buildor skills.

You are working on the skill: "${skillName || 'untitled'}"
Current skill state:
${JSON.stringify(skillState, null, 2)}

## What you CAN do:
- Answer questions about skill authoring (schema, params, execution modes, prompt syntax)
- Read project files (Read, Grep, Glob) to understand codebases for project-specific skills
- Search the web (WebSearch, WebFetch) for reference material
- Suggest changes to skill fields by outputting structured update markers

## What you CANNOT do:
- Edit, write, or delete any files directly
- Run shell commands
- Discuss topics unrelated to skill building
- Modify anything outside the current skill's fields

## How to update skill fields:
When you want to update a field, output this marker:
-<*{ "action": "skill_update", "field": "FIELD_NAME", "value": VALUE }*>-

Valid fields: name, description, tags, scope, projects, params, execution, visibility, health, promptContent

Examples:
-<*{ "action": "skill_update", "field": "description", "value": "Use when the user asks to refactor code, clean up imports, or simplify functions." }*>-
-<*{ "action": "skill_update", "field": "tags", "value": ["refactor", "cleanup"] }*>-
-<*{ "action": "skill_update", "field": "params", "value": [{"name": "scope", "type": "select", "required": true, "options": ["file", "directory"], "description": "What to refactor"}] }*>-

After outputting a marker, briefly confirm what you changed and why.

## Stay on topic:
If the user asks about something unrelated to skill building, politely redirect: "I'm scoped to skill building only. For general questions, use the Claude Chat panel."`;
}

function stripMarkers(text: string): string {
  return text.replace(SKILL_BUILDER_MARKER_RE, '').trim();
}

function extractMarkers(text: string): SkillUpdateAction[] {
  const actions: SkillUpdateAction[] = [];
  let match;
  while ((match = SKILL_BUILDER_MARKER_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(`{${match[1]}}`);
      if (parsed.action === 'skill_update' && parsed.field) {
        actions.push(parsed as SkillUpdateAction);
      }
    } catch { /* malformed marker, skip */ }
  }
  return actions;
}

export const SkillBuilderChat = forwardRef<SkillBuilderChatHandle>(function SkillBuilderChat(_props, ref) {
  const { editor, activeSkillName, isNew, updateField, updateExecution, updateVisibility, updateHealth } = useSkillBuilderStore();
  const isOpen = isNew || activeSkillName !== null;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose prefillInput for Discuss button
  useImperativeHandle(ref, () => ({
    prefillInput: (text: string) => {
      setInput(text);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  }), []);

  // Listen for review events — show review results in chat
  useEffect(() => {
    const handler = (event: { data: unknown }) => {
      const data = event.data as { localReviews?: Record<string, { status: string; message: string }> };
      if (data.localReviews) {
        const entries = Object.entries(data.localReviews);
        if (entries.length === 0) {
          setMessages((prev) => [...prev, { role: 'system', text: 'Review passed — no issues found.' }]);
        } else {
          const summary = entries.map(([field, r]) => `${r.status.toUpperCase()}: ${field} — ${r.message}`).join('\n');
          setMessages((prev) => [...prev, { role: 'system', text: `Review results:\n${summary}` }]);
        }
      }
    };
    buildorEvents.on('skill-review-requested', handler);
    return () => { buildorEvents.off('skill-review-requested', handler); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [messages]);

  // Stop session when skill closes
  useEffect(() => {
    if (!isOpen && sessionId) {
      stopSession(sessionId).catch(() => {});
      setSessionId(null);
      setMessages([]);
    }
  }, [isOpen, sessionId]);

  // Listen for output
  useEffect(() => {
    if (!sessionId) return;

    const unlistenOutput = listen<string>(`claude-output-${sessionId}`, (event) => {
      const parsed = parseStreamEvent(event.payload, sessionId);
      if (!parsed) return;

      // Extract text content
      const textParts = parsed.content
        .filter((c: ChatContent) => c.type === 'text' && c.text)
        .map((c: ChatContent) => c.text || '');
      const fullText = textParts.join('');

      if (fullText) {
        // Check for skill update markers
        const actions = extractMarkers(fullText);
        for (const action of actions) {
          applySkillUpdate(action);
        }

        const cleanText = stripMarkers(fullText);
        if (cleanText) {
          setMessages((prev) => [...prev, { role: 'assistant', text: cleanText }]);
        }

        // Show applied updates as system messages
        for (const action of actions) {
          setMessages((prev) => [...prev, { role: 'system', text: `Updated ${action.field}` }]);
        }
      }

      if (parsed.isResult) {
        setIsSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    });

    const unlistenExit = listen<string>(`claude-exit-${sessionId}`, () => {
      setSessionId(null);
      setIsSending(false);
      setMessages((prev) => [...prev, { role: 'system', text: 'Session ended.' }]);
    });

    return () => {
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
    };
  }, [sessionId]);

  const applySkillUpdate = useCallback((action: SkillUpdateAction) => {
    const { field, value } = action;
    switch (field) {
      case 'name': updateField('name', String(value)); break;
      case 'description': updateField('description', String(value)); break;
      case 'tags': updateField('tags', value as string[]); break;
      case 'scope': updateField('scope', value as 'general' | 'project'); break;
      case 'projects': updateField('projects', value as string[]); break;
      case 'params': updateField('params', value as typeof editor.params); break;
      case 'promptContent': updateField('promptContent', String(value)); break;
      case 'execution': updateExecution(value as Record<string, unknown>); break;
      case 'visibility': updateVisibility(value as Record<string, unknown>); break;
      case 'health': updateHealth(value as Record<string, unknown>); break;
    }
  }, [updateField, updateExecution, updateVisibility, updateHealth, editor]);

  const handleSendWithAutoStart = async () => {
    if (!input.trim() || isSending) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsSending(true);

    let sid = sessionId;
    if (!sid) {
      setIsStarting(true);
      try {
        const skillState: Record<string, unknown> = {
          name: editor.name, description: editor.description, tags: editor.tags,
          scope: editor.scope, projects: editor.projects, params: editor.params,
          execution: editor.execution, visibility: editor.visibility, health: editor.health,
          promptContent: editor.promptContent.substring(0, 500) + (editor.promptContent.length > 500 ? '...' : ''),
        };
        const systemPrompt = buildSkillBuilderPrompt(editor.name, skillState);
        const result = await startClaudeSession('.', 'sonnet', systemPrompt);
        sid = result.sessionId;
        setSessionId(sid);
      } catch (e) {
        setMessages((prev) => [...prev, { role: 'system', text: `Failed to start: ${String(e)}` }]);
        setIsSending(false);
        setIsStarting(false);
        return;
      }
      setIsStarting(false);
    }

    try {
      await sendClaudeMessage(sid, text);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'system', text: `Error: ${String(e)}` }]);
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-tertiary)', fontSize: 13, padding: 20, textAlign: 'center',
      }}>
        Open or create a skill to access Buildor assistance.
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        Skill Assistant
      </div>

      {/* Messages */}
      <div ref={outputRef} style={{
        flex: 1, overflow: 'auto', padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
            Ask me to help build your skill. I can suggest descriptions, parameters, prompt templates, and more.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 13, lineHeight: 1.5,
            maxWidth: '90%',
            ...(msg.role === 'user' ? {
              background: 'var(--accent-primary)', color: '#fff', alignSelf: 'flex-end',
            } : msg.role === 'system' ? {
              background: 'var(--bg-active)', color: 'var(--accent-secondary)',
              alignSelf: 'center', fontSize: 11, fontStyle: 'italic',
            } : {
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', alignSelf: 'flex-start',
              border: '1px solid var(--border-primary)',
            }),
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.text}
          </div>
        ))}
        {(isSending || isStarting) && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontStyle: 'italic', alignSelf: 'flex-start' }}>
            {isStarting ? 'Starting session...' : 'Thinking...'}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 12px', borderTop: '1px solid var(--border-primary)',
        display: 'flex', gap: 6,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWithAutoStart(); } }}
          placeholder="Ask about skill building..."
          disabled={isSending || isStarting}
          style={{
            flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
            borderRadius: 6, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSendWithAutoStart}
          disabled={!input.trim() || isSending || isStarting}
          style={{
            background: 'var(--accent-primary)', border: 'none', color: '#fff',
            borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: !input.trim() || isSending || isStarting ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
});
