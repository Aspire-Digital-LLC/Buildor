/**
 * Agent Health Monitor
 *
 * Tracks per-agent health state by subscribing to tool/message events.
 * Detects idle, stalling, looping, erroring states and escalates to
 * parent agents or the user when an agent becomes distressed.
 *
 * Phase 6 of the Skills & Agent System.
 */

import { buildorEvents, type BuildorEvent } from './buildorEvents';
import { injectIntoAgent, updateAgentHealth } from './commands/agents';
import { logEvent } from './commands/logging';
import type { AgentHealthState } from '@/types/agent';
import type { SkillHealthConfig } from '@/types/skill';

// --- Defaults ---

const DEFAULT_IDLE_SECONDS = 30;
const DEFAULT_STALL_SECONDS = 30;
const DEFAULT_LOOP_DETECTION_WINDOW = 5;
const DEFAULT_LOOP_THRESHOLD = 3;
const DEFAULT_ERROR_THRESHOLD = 3;
const DEFAULT_DISTRESS_SECONDS = 45;
const TICK_INTERVAL_MS = 5000; // Check every 5s

// --- Types ---

interface ToolCallRecord {
  toolName: string;
  inputHash: string;
  timestamp: number;
}

interface MonitoredAgent {
  sessionId: string;
  name: string;
  parentSessionId: string | null;
  healthState: AgentHealthState;
  lastActivityAt: number;
  lastActivityType: 'tool_call' | 'text' | 'none';
  recentToolCalls: ToolCallRecord[];
  consecutiveErrors: number;
  unhealthySince: number | null; // timestamp when first went unhealthy
  thresholds: Required<SkillHealthConfig>;
}

// --- Hash helper ---

function hashInput(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

// --- Singleton Monitor ---

class AgentHealthMonitor {
  private agents: Map<string, MonitoredAgent> = new Map();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: {
    toolExecuting: (e: BuildorEvent) => void;
    toolCompleted: (e: BuildorEvent) => void;
    messageReceived: (e: BuildorEvent) => void;
    agentCompleted: (e: BuildorEvent) => void;
    agentFailed: (e: BuildorEvent) => void;
  };

  constructor() {
    this.handlers = {
      toolExecuting: this.onToolExecuting.bind(this),
      toolCompleted: this.onToolCompleted.bind(this),
      messageReceived: this.onMessageReceived.bind(this),
      agentCompleted: this.onAgentExited.bind(this),
      agentFailed: this.onAgentExited.bind(this),
    };
  }

  /**
   * Start monitoring a newly-spawned agent.
   */
  track(
    sessionId: string,
    name: string,
    parentSessionId: string | null,
    healthConfig?: SkillHealthConfig,
  ): void {
    const thresholds: Required<SkillHealthConfig> = {
      idleSeconds: healthConfig?.idleSeconds ?? DEFAULT_IDLE_SECONDS,
      stallSeconds: healthConfig?.stallSeconds ?? DEFAULT_STALL_SECONDS,
      loopDetectionWindow: healthConfig?.loopDetectionWindow ?? DEFAULT_LOOP_DETECTION_WINDOW,
      loopThreshold: healthConfig?.loopThreshold ?? DEFAULT_LOOP_THRESHOLD,
      errorThreshold: healthConfig?.errorThreshold ?? DEFAULT_ERROR_THRESHOLD,
      distressSeconds: healthConfig?.distressSeconds ?? DEFAULT_DISTRESS_SECONDS,
    };

    this.agents.set(sessionId, {
      sessionId,
      name,
      parentSessionId,
      healthState: 'healthy',
      lastActivityAt: Date.now(),
      lastActivityType: 'none',
      recentToolCalls: [],
      consecutiveErrors: 0,
      unhealthySince: null,
      thresholds,
    });

    // Start the tick loop if not already running
    if (!this.tickTimer) {
      this.subscribeEvents();
      this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    }

    logEvent({
      functionArea: 'claude-chat',
      level: 'debug',
      operation: 'agent-health-track',
      message: `Health monitor tracking agent "${name}" (${sessionId})`,
    }).catch(() => {});
  }

  /**
   * Stop monitoring an agent (called on completion/kill).
   */
  untrack(sessionId: string): void {
    this.agents.delete(sessionId);

    // Stop the tick loop if no agents remain
    if (this.agents.size === 0 && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
      this.unsubscribeEvents();
    }
  }

  /**
   * Reset health timers for an agent (extend_agent marker).
   */
  extend(sessionId: string): void {
    const agent = this.agents.get(sessionId);
    if (!agent) return;

    agent.lastActivityAt = Date.now();
    agent.consecutiveErrors = 0;
    agent.unhealthySince = null;

    if (agent.healthState !== 'healthy') {
      this.transition(agent, 'healthy');
    }
  }

  /**
   * Get current health state for an agent.
   */
  getState(sessionId: string): AgentHealthState | null {
    return this.agents.get(sessionId)?.healthState ?? null;
  }

  /**
   * Get the name of a tracked agent.
   */
  getName(sessionId: string): string | null {
    return this.agents.get(sessionId)?.name ?? null;
  }

  /**
   * Check if any agents are currently tracked.
   */
  get active(): boolean {
    return this.agents.size > 0;
  }

  // --- Event handlers ---

  private onToolExecuting(event: BuildorEvent): void {
    const sid = event.sessionId;
    if (!sid) return;
    const agent = this.agents.get(sid);
    if (!agent) return;

    const data = event.data as { toolName?: string; input?: unknown };
    agent.lastActivityAt = Date.now();
    agent.lastActivityType = 'tool_call';

    // Record for loop detection
    agent.recentToolCalls.push({
      toolName: data.toolName || '',
      inputHash: hashInput(data.input),
      timestamp: Date.now(),
    });

    // Trim to window size
    const window = agent.thresholds.loopDetectionWindow;
    if (agent.recentToolCalls.length > window) {
      agent.recentToolCalls = agent.recentToolCalls.slice(-window);
    }

    // Check for loop: same tool+input repeated loopThreshold times in window
    if (this.detectLoop(agent)) {
      if (agent.healthState !== 'looping' && agent.healthState !== 'distressed') {
        this.transition(agent, 'looping');
      }
      return;
    }

    // Activity means potentially recovering from unhealthy
    if (agent.healthState === 'idle' || agent.healthState === 'stalling') {
      this.transition(agent, 'healthy');
    }
  }

  private onToolCompleted(event: BuildorEvent): void {
    const sid = event.sessionId;
    if (!sid) return;
    const agent = this.agents.get(sid);
    if (!agent) return;

    const data = event.data as { isError?: boolean };
    agent.lastActivityAt = Date.now();

    if (data.isError) {
      agent.consecutiveErrors++;
      if (agent.consecutiveErrors >= agent.thresholds.errorThreshold) {
        if (agent.healthState !== 'erroring' && agent.healthState !== 'distressed') {
          this.transition(agent, 'erroring');
        }
      }
    } else {
      agent.consecutiveErrors = 0;
      // Successful tool result can recover from erroring
      if (agent.healthState === 'erroring') {
        this.transition(agent, 'healthy');
      }
    }
  }

  private onMessageReceived(event: BuildorEvent): void {
    const sid = event.sessionId;
    if (!sid) return;
    const agent = this.agents.get(sid);
    if (!agent) return;

    agent.lastActivityAt = Date.now();
    agent.lastActivityType = 'text';

    // Text output can recover from stalling/looping
    if (agent.healthState === 'stalling' || agent.healthState === 'looping') {
      this.transition(agent, 'healthy');
    }
  }

  // --- Tick: time-based checks ---

  private tick(): void {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (agent.healthState === 'distressed') continue; // Already at terminal unhealthy state

      const elapsedMs = now - agent.lastActivityAt;
      const elapsedSec = elapsedMs / 1000;

      // Check for idle (last activity was text, no new activity)
      if (
        agent.healthState === 'healthy' &&
        agent.lastActivityType === 'text' &&
        elapsedSec >= agent.thresholds.idleSeconds
      ) {
        this.transition(agent, 'idle');
      }

      // Check for stalling (last activity was tool_call or none, no new activity)
      if (
        agent.healthState === 'healthy' &&
        (agent.lastActivityType === 'tool_call' || agent.lastActivityType === 'none') &&
        elapsedSec >= agent.thresholds.stallSeconds
      ) {
        this.transition(agent, 'stalling');
      }

      // Check for distress (any unhealthy state persisting)
      // Note: 'distressed' is already excluded by the continue guard above
      if (
        agent.unhealthySince &&
        agent.healthState !== 'healthy'
      ) {
        const unhealthyDurationSec = (now - agent.unhealthySince) / 1000;
        if (unhealthyDurationSec >= agent.thresholds.distressSeconds) {
          this.transition(agent, 'distressed');
        }
      }
    }
  }

  // --- Loop detection ---

  private detectLoop(agent: MonitoredAgent): boolean {
    const calls = agent.recentToolCalls;
    if (calls.length < agent.thresholds.loopThreshold) return false;

    // Check if the last N calls are identical (same tool + same input)
    const threshold = agent.thresholds.loopThreshold;
    const recent = calls.slice(-threshold);
    const first = recent[0];
    return recent.every(
      (c) => c.toolName === first.toolName && c.inputHash === first.inputHash,
    );
  }

  // --- State transitions ---

  private transition(agent: MonitoredAgent, newState: AgentHealthState): void {
    const previousState = agent.healthState;
    if (previousState === newState) return;

    agent.healthState = newState;

    // Sync to Rust backend so pool entry + mailbox deposit reflect real state
    updateAgentHealth(agent.sessionId, newState).catch(() => {});

    // Track unhealthy start time
    if (newState === 'healthy') {
      agent.unhealthySince = null;
      agent.consecutiveErrors = 0;
    } else if (!agent.unhealthySince) {
      agent.unhealthySince = Date.now();
    }

    // Emit event
    buildorEvents.emit('agent-health-changed', {
      agentSessionId: agent.sessionId,
      agentName: agent.name,
      previousState,
      newState,
      parentSessionId: agent.parentSessionId,
      details: this.buildDetails(agent, newState),
    }, agent.sessionId);

    logEvent({
      functionArea: 'claude-chat',
      level: newState === 'distressed' ? 'warn' : 'info',
      operation: 'agent-health-transition',
      message: `Agent "${agent.name}" (${agent.sessionId}): ${previousState} → ${newState}`,
    }).catch(() => {});

    // Escalate if entering distressed
    if (newState === 'distressed') {
      this.escalate(agent);
    }
  }

  private buildDetails(agent: MonitoredAgent, state: AgentHealthState): string {
    switch (state) {
      case 'idle':
        return `No activity for ${agent.thresholds.idleSeconds}s after text output`;
      case 'stalling':
        return `No activity for ${agent.thresholds.stallSeconds}s after tool call`;
      case 'looping':
        return `Same tool+input repeated ${agent.thresholds.loopThreshold} times in last ${agent.thresholds.loopDetectionWindow} calls`;
      case 'erroring':
        return `${agent.consecutiveErrors} consecutive tool errors`;
      case 'distressed':
        return `Unhealthy for ${agent.thresholds.distressSeconds}s — escalating`;
      case 'healthy':
        return 'Recovered';
      default:
        return '';
    }
  }

  // --- Escalation ---

  private escalate(agent: MonitoredAgent): void {
    if (agent.parentSessionId) {
      // Inject alert into parent session
      const alertMessage = [
        `[BUILDOR_ALERT: Agent "${agent.name}" is distressed (${agent.healthState})]`,
        `Details: ${this.buildDetails(agent, agent.healthState)}`,
        `Session ID: ${agent.sessionId}`,
        '',
        'You can respond with one of these markers:',
        `-<*{ "action": "kill_agent", "agentId": "${agent.sessionId}", "mark": "failed" }*>- — Kill the agent`,
        `-<*{ "action": "extend_agent", "agentId": "${agent.sessionId}", "seconds": 60 }*>- — Give it more time`,
        `-<*{ "action": "takeover_agent", "agentId": "${agent.sessionId}" }*>- — Kill it and get a summary of its work`,
      ].join('\n');

      injectIntoAgent(agent.parentSessionId, alertMessage).catch((err) => {
        logEvent({
          functionArea: 'claude-chat',
          level: 'error',
          operation: 'agent-escalate-parent',
          message: `Failed to escalate agent "${agent.name}" to parent: ${err}`,
        }).catch(() => {});
      });
    } else {
      // Top-level agent: escalate to user
      buildorEvents.emit('user-attention-needed', {
        reason: 'agent-distressed',
        agentSessionId: agent.sessionId,
        agentName: agent.name,
        details: this.buildDetails(agent, agent.healthState),
      }, agent.sessionId);
    }
  }

  // --- Agent exit handler (auto-untrack) ---

  private onAgentExited(event: BuildorEvent): void {
    const data = event.data as { agentSessionId?: string };
    if (data.agentSessionId) {
      this.untrack(data.agentSessionId);
    }
  }

  // --- Event bus subscriptions ---

  private subscribeEvents(): void {
    buildorEvents.on('tool-executing', this.handlers.toolExecuting);
    buildorEvents.on('tool-completed', this.handlers.toolCompleted);
    buildorEvents.on('message-received', this.handlers.messageReceived);
    buildorEvents.on('agent-completed', this.handlers.agentCompleted);
    buildorEvents.on('agent-failed', this.handlers.agentFailed);
  }

  private unsubscribeEvents(): void {
    buildorEvents.off('tool-executing', this.handlers.toolExecuting);
    buildorEvents.off('tool-completed', this.handlers.toolCompleted);
    buildorEvents.off('message-received', this.handlers.messageReceived);
    buildorEvents.off('agent-completed', this.handlers.agentCompleted);
    buildorEvents.off('agent-failed', this.handlers.agentFailed);
  }
}

// Export singleton
export const agentHealthMonitor = new AgentHealthMonitor();
