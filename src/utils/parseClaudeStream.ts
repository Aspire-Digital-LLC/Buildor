import type { ParsedMessage, ChatContent } from '@/components/claude-chat/ChatMessage';
import { buildorEvents } from './buildorEvents';

export function parseStreamEvent(jsonLine: string, sessionId?: string): ParsedMessage | null {
  try {
    const event = JSON.parse(jsonLine);

    if (event.type === 'system' && event.subtype === 'init') {
      buildorEvents.emit('session-started', {
        model: event.model,
        tools: event.tools,
        skills: event.skills,
      }, sessionId);

      return {
        role: 'system',
        content: [{ type: 'text', text: `Model: ${event.model} · Tools: ${event.tools?.length || 0} · Skills: ${event.skills?.length || 0}` }],
        model: event.model,
      };
    }

    if (event.type === 'assistant' && event.message?.content) {
      // Extract token usage from message if available
      const usage = event.message?.usage || event.usage;
      if (usage) {
        buildorEvents.emit('usage-updated', {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens || 0,
          model: event.message?.model,
        }, sessionId);
      }

      const content: ChatContent[] = event.message.content.map((block: any) => {
        if (block.type === 'text') {
          buildorEvents.emit('message-received', { text: block.text }, sessionId);
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          buildorEvents.emit('tool-executing', {
            toolName: block.name,
            toolUseId: block.id,
            input: block.input,
          }, sessionId);

          // Intercept task tools to update the sticky task tracker
          if (block.name === 'TodoWrite') {
            const input = block.input || {};
            if (input.todos) {
              buildorEvents.emit('tasks-updated', { action: 'replace', todos: input.todos }, sessionId);
            }
          } else if (block.name === 'TaskCreate' || block.name === 'TaskOutput') {
            buildorEvents.emit('tasks-updated', { action: 'create', task: block.input }, sessionId);
          } else if (block.name === 'TaskUpdate') {
            buildorEvents.emit('tasks-updated', { action: 'update', task: block.input }, sessionId);
          }

          return {
            type: 'tool_use' as const,
            name: block.name,
            input: block.input,
            toolUseId: block.id,
          };
        }
        if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c.text || '').join('\n')
              : JSON.stringify(block.content);
          buildorEvents.emit('tool-completed', {
            toolUseId: block.tool_use_id,
            isError: block.is_error,
          }, sessionId);
          return {
            type: 'tool_result' as const,
            content: resultText,
            toolUseId: block.tool_use_id,
            isError: block.is_error,
          };
        }
        if (block.type === 'thinking') {
          return { type: 'thinking' as const, text: block.thinking };
        }
        return { type: 'text' as const, text: JSON.stringify(block) };
      });

      return {
        role: 'assistant',
        content,
        model: event.message.model,
      };
    }

    // Permission request from Claude (control_request with can_use_tool subtype)
    if (
      event.type === 'control_request' && event.request?.subtype === 'can_use_tool' ||
      event.type === 'permission_request' || event.type === 'permission'
    ) {
      const toolName = event.request?.tool_name || event.tool?.name || event.permission?.tool_name || 'Unknown tool';
      const toolUseId = event.request?.tool_use_id || event.tool?.id || event.permission?.tool_use_id || '';
      const requestId = event.request_id || '';
      const input = event.request?.input || event.tool?.input || event.permission?.input || {};

      // Build a human-readable description
      let description = `${toolName}`;
      if (toolName === 'Edit' && input.file_path) {
        description = `Edit file: ${input.file_path}`;
      } else if (toolName === 'Write' && input.file_path) {
        description = `Create/write file: ${input.file_path}`;
      } else if (toolName === 'Bash' && input.command) {
        description = `Run command: ${input.command}`;
      } else if (toolName === 'Read' && input.file_path) {
        description = `Read file: ${input.file_path}`;
      }

      buildorEvents.emit('permission-required', {
        requestId,
        toolUseId,
        toolName,
        input,
        description,
      }, sessionId);

      buildorEvents.emit('user-attention-needed', {
        reason: 'permission',
        toolName,
        description,
      }, sessionId);

      return {
        role: 'tool',
        content: [{
          type: 'permission_request' as ChatContent['type'],
          name: toolName,
          input,
          toolUseId,
          requestId,
          text: description,
        }],
      };
    }

    if (event.type === 'result') {
      buildorEvents.emit('cost-updated', {
        costUsd: event.total_cost_usd,
        durationMs: event.duration_ms,
        turns: event.num_turns,
      }, sessionId);

      buildorEvents.emit('turn-completed', {
        costUsd: event.total_cost_usd,
        durationMs: event.duration_ms,
        turns: event.num_turns,
      }, sessionId);

      // Emit final usage stats from result if available
      if (event.usage || event.total_input_tokens || event.input_tokens) {
        buildorEvents.emit('usage-updated', {
          inputTokens: event.usage?.input_tokens || event.total_input_tokens || event.input_tokens || 0,
          outputTokens: event.usage?.output_tokens || event.total_output_tokens || event.output_tokens || 0,
          cacheReadTokens: event.usage?.cache_read_input_tokens || 0,
          cacheCreationTokens: event.usage?.cache_creation_input_tokens || 0,
          isResultTotal: true,
        }, sessionId);
      }

      return {
        role: 'system',
        content: [{
          type: 'text',
          text: `✓ Completed in ${(event.duration_ms / 1000).toFixed(1)}s · $${event.total_cost_usd?.toFixed(4) || '0'} · ${event.num_turns} turn(s)`,
        }],
        costUsd: event.total_cost_usd,
        durationMs: event.duration_ms,
        isResult: true,
      };
    }

    if (event.type === 'error') {
      buildorEvents.emit('error-occurred', {
        message: event.error?.message || event.message || 'Unknown error',
      }, sessionId);

      return {
        role: 'system',
        content: [{ type: 'text', text: `Error: ${event.error?.message || event.message || JSON.stringify(event)}` }],
        isResult: true,
      };
    }

    // Capture rate limit / usage events for StatusBar
    if (event.type === 'rate_limit' || event.type === 'rate_limit_event' || event.type === 'usage') {
      buildorEvents.emit('usage-updated', {
        // Session/rate limit fields (various possible shapes)
        sessionUsedPercent: event.session_usage_percent ?? event.usage_percent ?? event.percent_used ?? null,
        sessionResetAt: event.session_reset_at ?? event.reset_at ?? event.resets_at ?? null,
        sessionResetIn: event.resets_in ?? event.reset_in ?? null,
        weeklyUsedPercent: event.weekly_usage_percent ?? event.weekly_percent_used ?? null,
        weeklyResetAt: event.weekly_reset_at ?? null,
        // Token counts if present
        inputTokens: event.input_tokens ?? event.usage?.input_tokens ?? 0,
        outputTokens: event.output_tokens ?? event.usage?.output_tokens ?? 0,
        isRateLimitEvent: true,
      }, sessionId);
      return null; // Don't display in chat
    }

    // Log unhandled events at debug level for future discovery
    return null;
  } catch {
    if (jsonLine.trim()) {
      return {
        role: 'assistant',
        content: [{ type: 'text', text: jsonLine }],
      };
    }
    return null;
  }
}
