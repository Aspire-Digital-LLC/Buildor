/**
 * Buildor Event Bus
 *
 * App-wide event system for decoupling AI responses from UI behaviors.
 * Components subscribe to events they care about. Producers emit events
 * when significant things happen.
 *
 * Usage:
 *   buildorEvents.on('permission-required', (data) => { ... });
 *   buildorEvents.emit('permission-required', { toolName: 'Write', ... });
 *   buildorEvents.off('permission-required', handler);
 */

export type BuildorEventType =
  | 'permission-required'     // Claude needs user approval for a tool
  | 'permission-resolved'     // User approved/denied a permission
  | 'user-attention-needed'   // Generic: window should blink/notify
  | 'session-started'         // Claude session started
  | 'session-ended'           // Claude session ended
  | 'message-received'        // New message from Claude
  | 'tool-executing'          // Claude is running a tool
  | 'tool-completed'          // Tool execution finished
  | 'error-occurred'          // An error happened
  | 'cost-updated'            // Running cost changed
  | 'turn-completed'          // Claude finished responding to a message
  | 'branch-switched'         // User switched a checked-out branch
  | 'usage-updated'           // Token usage / context window updated
  | 'navigate-settings';      // Navigate to a specific settings section

export interface BuildorEvent<T = unknown> {
  type: BuildorEventType;
  sessionId?: string;
  timestamp: string;
  data: T;
}

export interface PermissionRequestData {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  description: string;
}

type EventHandler = (event: BuildorEvent) => void;

class BuildorEventBus {
  private handlers: Map<BuildorEventType, Set<EventHandler>> = new Map();

  on(type: BuildorEventType, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: BuildorEventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(type: BuildorEventType, data: unknown = {}, sessionId?: string): void {
    const event: BuildorEvent = {
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      data,
    };

    this.handlers.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the bus
      }
    });
  }

  // Convenience: wait for a specific event once
  once(type: BuildorEventType): Promise<BuildorEvent> {
    return new Promise((resolve) => {
      const handler = (event: BuildorEvent) => {
        this.off(type, handler);
        resolve(event);
      };
      this.on(type, handler);
    });
  }
}

export const buildorEvents = new BuildorEventBus();
