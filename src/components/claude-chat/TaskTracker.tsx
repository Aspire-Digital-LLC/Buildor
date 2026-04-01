import { useState, useEffect } from 'react';
import { buildorEvents } from '@/utils/buildorEvents';

export interface TaskItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  activeForm?: string;
}

interface TaskTrackerProps {
  sessionId?: string;
}

const statusIcon = (status: string) => {
  if (status === 'completed') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#238636" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === 'in_progress') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#d29922" strokeWidth="1.5" />
      <path d="M8 1a7 7 0 0 1 0 14" fill="#d29922" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--text-tertiary)" strokeWidth="1.5" />
    </svg>
  );
};

const statusColor = (status: string) => {
  if (status === 'completed') return '#3fb950';
  if (status === 'in_progress') return '#d29922';
  return 'var(--text-tertiary)';
};

const statusLabel = (status: string, activeForm?: string) => {
  if (status === 'in_progress' && activeForm) return activeForm;
  if (status === 'completed') return 'done';
  if (status === 'in_progress') return 'working...';
  return 'pending';
};

const priorityDot = (priority: string) => {
  if (priority === 'high') return '#f85149';
  if (priority === 'medium') return '#d29922';
  return 'transparent';
};

/** Parse "[depends on #1, #2]" from task content, return clean text + dependency IDs */
const parseDeps = (content: string): { text: string; deps: string[] } => {
  const match = content.match(/\s*[\[(](depends on [^\])]+)[\])]\s*/i);
  if (!match) return { text: content, deps: [] };
  const deps = match[1].replace(/^depends on\s*/i, '').split(/,\s*/).map((d) => d.trim());
  const text = content.replace(match[0], '').trim();
  return { text, deps };
};

/** Topological sort: order tasks so dependencies come before dependents */
function topoSort(tasks: TaskItem[]): TaskItem[] {
  // Build a map of id -> task and parse deps for each
  const idSet = new Set(tasks.map((t) => t.id));
  const depsMap = new Map<string, string[]>();
  for (const task of tasks) {
    const { deps } = parseDeps(task.content);
    // Normalize dep refs: "#1" -> "1", keep only deps that exist in the list
    const resolved = deps
      .map((d) => d.replace(/^#/, ''))
      .filter((d) => idSet.has(d));
    depsMap.set(task.id, resolved);
  }

  const result: TaskItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // cycle — skip to avoid infinite loop
    visiting.add(id);
    for (const dep of depsMap.get(id) || []) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    const task = taskById.get(id);
    if (task) result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}

export function TaskTracker({ sessionId }: TaskTrackerProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handler = (event: { sessionId?: string; data: unknown }) => {
      // Accept events from current session, or any session if we don't have one yet
      // This preserves tasks across session restarts (stop → new session)

      const data = event.data as {
        action: 'replace' | 'create' | 'update' | 'clear';
        todos?: TaskItem[];
        task?: Record<string, unknown>;
      };

      if (data.action === 'clear') {
        setTasks([]);
        return;
      }

      if (data.action === 'replace' && data.todos && Array.isArray(data.todos)) {
        // TodoWrite — full list replacement. Normalize: assign IDs if missing, default priority.
        const normalized = (data.todos as unknown as Record<string, unknown>[]).map((t, i) => ({
          id: String(t.id || i + 1),
          content: String(t.content || t.subject || t.description || ''),
          status: (t.status as TaskItem['status']) || 'pending',
          priority: (t.priority as TaskItem['priority']) || 'medium',
          activeForm: t.activeForm as string | undefined,
        }));
        setTasks(normalized);
      } else if (data.action === 'create' && data.task) {
        // TaskCreate — append a new task
        const t = data.task;
        setTasks((prev) => {
          const id = String(t.taskId || t.id || prev.length + 1);
          // Don't add duplicates
          if (prev.some((p) => p.id === id)) return prev;
          return [...prev, {
            id,
            content: String(t.subject || t.content || t.description || ''),
            status: (t.status as TaskItem['status']) || 'pending',
            priority: (t.priority as TaskItem['priority']) || 'medium',
            activeForm: t.activeForm as string | undefined,
          }];
        });
      } else if (data.action === 'update' && data.task) {
        // TaskUpdate — update an existing task
        const t = data.task;
        const taskId = String(t.taskId || t.id || '');
        setTasks((prev) => prev.map((p) => {
          if (p.id !== taskId) return p;
          return {
            ...p,
            ...(t.subject ? { content: String(t.subject) } : {}),
            ...(t.status ? { status: t.status as TaskItem['status'] } : {}),
            ...(t.priority ? { priority: t.priority as TaskItem['priority'] } : {}),
            ...(t.activeForm !== undefined ? { activeForm: t.activeForm as string } : {}),
          };
        }));
      }
    };
    buildorEvents.on('tasks-updated', handler);
    return () => { buildorEvents.off('tasks-updated', handler); };
  }, [sessionId]);

  if (tasks.length === 0) return null;

  // Topological sort: tasks with no/resolved deps first, dependents after
  const sorted = topoSort(tasks);
  const completed = sorted.filter((t) => t.status === 'completed').length;
  const total = sorted.length;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div style={{
      borderTop: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="var(--accent-primary)" strokeWidth="1.2" />
          <path d="M4 5h8M4 8h6M4 11h7" stroke="var(--accent-primary)" strokeWidth="1" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Tasks</span>
        <span style={{
          fontSize: 11,
          color: completed === total ? '#3fb950' : 'var(--text-tertiary)',
          fontWeight: 600,
          fontFamily: "'Cascadia Code', monospace",
        }}>
          {completed}/{total}
        </span>

        {/* Mini progress bar */}
        <div style={{
          flex: 1,
          height: 3,
          background: 'var(--border-primary)',
          borderRadius: 2,
          overflow: 'hidden',
          maxWidth: 120,
        }}>
          <div style={{
            width: `${progressPct}%`,
            height: '100%',
            background: completed === total ? '#3fb950' : 'var(--accent-primary)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ flex: 1 }} />
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          style={{
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: 'var(--text-tertiary)',
          }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Task list */}
      {!collapsed && (
        <div style={{
          padding: '0 12px 8px',
          maxHeight: 200,
          overflow: 'auto',
        }}>
          {sorted.map((task) => {
            const { text, deps } = parseDeps(task.content);
            return (
              <div key={task.id} style={{ padding: '2px 0' }}>
                {/* Main task row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                }}>
                  {/* Priority dot */}
                  <div style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: priorityDot(task.priority),
                    flexShrink: 0,
                  }} />

                  {/* Status icon */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {statusIcon(task.status)}
                  </div>

                  {/* Task content (without dependency text) */}
                  <span style={{
                    flex: 1,
                    color: task.status === 'completed' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {text}
                  </span>

                  {/* Status label */}
                  <span style={{
                    fontSize: 10,
                    color: statusColor(task.status),
                    fontStyle: task.status === 'in_progress' ? 'italic' : 'normal',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {statusLabel(task.status, task.activeForm)}
                  </span>
                </div>

                {/* Dependency sub-line */}
                {deps.length > 0 && (
                  <div style={{
                    marginLeft: 28,
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    paddingTop: 1,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
                      <path d="M2 0v6h8" stroke="var(--text-tertiary)" strokeWidth="1" fill="none" strokeLinecap="round" />
                    </svg>
                    <span>depends on</span>
                    {deps.map((dep, di) => (
                      <span key={di} style={{
                        background: 'var(--border-primary)',
                        padding: '0 4px',
                        borderRadius: 3,
                        fontFamily: "'Cascadia Code', monospace",
                        color: 'var(--accent-primary)',
                      }}>
                        {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
