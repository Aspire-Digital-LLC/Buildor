import type { ParsedMessage, ChatContent } from '@/components/claude-chat/ChatMessage';

export function parseStreamEvent(jsonLine: string): ParsedMessage | null {
  try {
    const event = JSON.parse(jsonLine);

    if (event.type === 'system' && event.subtype === 'init') {
      return {
        role: 'system',
        content: [{ type: 'text', text: `Model: ${event.model} · Tools: ${event.tools?.length || 0} · Skills: ${event.skills?.length || 0}` }],
        model: event.model,
      };
    }

    if (event.type === 'assistant' && event.message?.content) {
      const content: ChatContent[] = event.message.content.map((block: any) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
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

    if (event.type === 'result') {
      return {
        role: 'system',
        content: [{
          type: 'text',
          text: `✓ Completed in ${(event.duration_ms / 1000).toFixed(1)}s · $${event.total_cost_usd?.toFixed(4) || '0'} · ${event.num_turns} turn(s)`,
        }],
        costUsd: event.total_cost_usd,
        durationMs: event.duration_ms,
      };
    }

    // Skip rate_limit_event and other non-display events
    return null;
  } catch {
    // Not valid JSON — treat as raw text
    if (jsonLine.trim()) {
      return {
        role: 'assistant',
        content: [{ type: 'text', text: jsonLine }],
      };
    }
    return null;
  }
}
