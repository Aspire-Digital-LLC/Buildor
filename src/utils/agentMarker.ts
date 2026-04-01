import type { AgentMarker } from '@/types/agent';

/**
 * Marker format: -<*{ "action": "spawn_agent", ... }*>-
 *
 * Extracts all markers from a text block, returns cleaned text and parsed markers.
 * Handles multiple markers in one block and malformed JSON gracefully.
 */

const MARKER_REGEX = /-<\*(\{[\s\S]*?\})\*>-/g;

export interface MarkerParseResult {
  cleanText: string;
  markers: AgentMarker[];
}

export function parseAgentMarkers(text: string): MarkerParseResult {
  const markers: AgentMarker[] = [];
  const cleanText = text.replace(MARKER_REGEX, (_match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.action === 'string') {
        markers.push(parsed as AgentMarker);
      }
    } catch {
      // Malformed JSON — skip this marker, don't strip it
      return _match;
    }
    return ''; // Strip successfully parsed markers from output
  }).trim();

  return { cleanText, markers };
}

/**
 * Quick check whether text contains any agent markers.
 * Use this before calling parseAgentMarkers to avoid regex on every chunk.
 */
export function hasAgentMarkers(text: string): boolean {
  return text.includes('-<*{');
}
