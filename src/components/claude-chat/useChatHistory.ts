import { useRef, useCallback } from 'react';
import {
  createChatSession,
  endChatSession,
  saveChatMessage,
  generateChatTitle,
} from '@/utils/commands/chatHistory';
import type { ParsedMessage } from './ChatMessage';

interface UseChatHistoryOptions {
  projectName: string;
  repoPath: string;
  branchName: string;
  worktreeSessionId?: string | null;
}

export function useChatHistory({ projectName, repoPath, branchName, worktreeSessionId }: UseChatHistoryOptions) {
  const chatSessionIdRef = useRef<string | null>(null);
  const seqRef = useRef<number>(0);
  const userMessageCountRef = useRef<number>(0);
  const titleGeneratedRef = useRef<boolean>(false);

  const startSession = useCallback(async (claudeSessionId: string) => {
    chatSessionIdRef.current = claudeSessionId;
    seqRef.current = 0;
    userMessageCountRef.current = 0;
    titleGeneratedRef.current = false;
    createChatSession(
      claudeSessionId,
      projectName,
      repoPath,
      worktreeSessionId || null,
      branchName,
    ).catch(() => {});
  }, [projectName, repoPath, branchName, worktreeSessionId]);

  const endSession = useCallback(async () => {
    const id = chatSessionIdRef.current;
    if (!id) return;
    endChatSession(id).catch(() => {});
    // Generate title if we haven't yet and have enough messages
    if (!titleGeneratedRef.current && userMessageCountRef.current >= 1) {
      generateChatTitle(id).catch(() => {});
    }
    chatSessionIdRef.current = null;
  }, []);

  const saveMessage = useCallback((parsed: ParsedMessage) => {
    const id = chatSessionIdRef.current;
    if (!id) return;
    const seq = ++seqRef.current;
    saveChatMessage(
      id,
      seq,
      parsed.role,
      JSON.stringify(parsed.content),
      parsed.model || null,
      parsed.costUsd || null,
      parsed.durationMs || null,
      parsed.isResult || false,
    ).catch(() => {});
  }, []);

  const saveUserMessage = useCallback((content: unknown[]) => {
    const id = chatSessionIdRef.current;
    if (!id) return;
    const seq = ++seqRef.current;
    userMessageCountRef.current++;
    saveChatMessage(
      id,
      seq,
      'user',
      JSON.stringify(content),
    ).catch(() => {});

    // Trigger title generation after 3rd user message, then every 15th
    const count = userMessageCountRef.current;
    if (count === 3 || (count > 3 && count % 15 === 0)) {
      titleGeneratedRef.current = true;
      generateChatTitle(id).catch(() => {});
    }
  }, []);

  return {
    chatSessionIdRef,
    startSession,
    endSession,
    saveMessage,
    saveUserMessage,
  };
}
