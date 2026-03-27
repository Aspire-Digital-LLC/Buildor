import { useState, useEffect } from 'react';
import { buildorEvents, type BuildorEvent } from '@/utils/buildorEvents';

export type ChatState = 'idle' | 'working' | 'attention' | 'error';

// Inject glow keyframes once
const styleId = 'chat-glow-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes glowPulseBlue {
      0%, 100% {
        border-color: rgba(88, 166, 255, 0.3);
        outline-color: rgba(88, 166, 255, 0.05);
        box-shadow: inset 0 0 20px rgba(88, 166, 255, 0.15);
      }
      50% {
        border-color: rgba(88, 166, 255, 0.9);
        outline-color: rgba(88, 166, 255, 0.3);
        box-shadow: inset 0 0 50px rgba(88, 166, 255, 0.25);
      }
    }
    @keyframes glowFlutterOrange {
      0% {
        border-color: rgba(210, 153, 34, 0.4);
        outline-color: rgba(210, 153, 34, 0.1);
        box-shadow: inset 0 0 20px rgba(210, 153, 34, 0.15);
      }
      25% {
        border-color: rgba(210, 153, 34, 0.9);
        outline-color: rgba(210, 153, 34, 0.35);
        box-shadow: inset 0 0 50px rgba(210, 153, 34, 0.3);
      }
      50% {
        border-color: rgba(210, 153, 34, 0.2);
        outline-color: rgba(210, 153, 34, 0.03);
        box-shadow: inset 0 0 10px rgba(210, 153, 34, 0.08);
      }
      75% {
        border-color: rgba(210, 153, 34, 0.95);
        outline-color: rgba(210, 153, 34, 0.4);
        box-shadow: inset 0 0 55px rgba(210, 153, 34, 0.35);
      }
      100% {
        border-color: rgba(210, 153, 34, 0.4);
        outline-color: rgba(210, 153, 34, 0.1);
        box-shadow: inset 0 0 20px rgba(210, 153, 34, 0.15);
      }
    }
    @keyframes fadeOutMessage {
      0% { opacity: 1; max-height: 200px; margin-bottom: 4px; padding: 8px 12px; }
      80% { opacity: 1; max-height: 200px; margin-bottom: 4px; padding: 8px 12px; }
      100% { opacity: 0; max-height: 0; margin-bottom: 0; padding: 0 12px; overflow: hidden; }
    }
  `;
  document.head.appendChild(style);
}

export function getGlowStyle(state: ChatState): React.CSSProperties {
  switch (state) {
    case 'working':
      // Slow, smooth pulse — electric blue, thick border + outline glow
      return {
        animation: 'glowPulseBlue 2.5s ease-in-out infinite',
        border: '4px solid rgba(88, 166, 255, 0.5)',
        outline: '6px solid rgba(88, 166, 255, 0.12)',
        outlineOffset: '-2px',
      } as React.CSSProperties;
    case 'attention':
      // Rapid flutter — urgent orange
      return {
        animation: 'glowFlutterOrange 0.8s ease-in-out infinite',
        border: '4px solid rgba(210, 153, 34, 0.6)',
        outline: '6px solid rgba(210, 153, 34, 0.18)',
        outlineOffset: '-2px',
      } as React.CSSProperties;
    case 'error':
      // Solid, no animation — steady red
      return {
        animation: 'none',
        border: '4px solid rgba(248, 81, 73, 0.8)',
        outline: '6px solid rgba(248, 81, 73, 0.25)',
        outlineOffset: '-2px',
        boxShadow: 'inset 0 0 60px rgba(248, 81, 73, 0.35)',
      } as React.CSSProperties;
    default:
      return {
        animation: 'none',
        border: '1px solid transparent',
        outline: 'none',
        boxShadow: 'none',
      };
  }
}

export function useChatGlow(sessionId: string | null, isSending?: boolean): ChatState {
  const [eventState, setEventState] = useState<ChatState>('idle');

  // isSending immediately triggers 'working' — don't wait for stream events
  const state: ChatState = isSending && eventState === 'idle' ? 'working' : eventState;

  useEffect(() => {
    if (!sessionId) { setEventState('idle'); return; }

    const onToolExec = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) {
        // Don't downgrade attention → working
        setEventState((s) => s === 'attention' ? s : 'working');
      }
    };
    const onMessage = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) {
        setEventState((s) => s === 'attention' ? s : 'working');
      }
    };
    const onPermission = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) setEventState('attention');
    };
    const onAttention = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) setEventState('attention');
    };
    const onError = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) setEventState('error');
    };
    const onTurnComplete = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) setEventState('idle');
    };
    const onPermResolved = (e: BuildorEvent) => {
      if (e.sessionId === sessionId) setEventState('working');
    };

    buildorEvents.on('tool-executing', onToolExec);
    buildorEvents.on('message-received', onMessage);
    buildorEvents.on('permission-required', onPermission);
    buildorEvents.on('user-attention-needed', onAttention);
    buildorEvents.on('error-occurred', onError);
    buildorEvents.on('turn-completed', onTurnComplete);
    buildorEvents.on('permission-resolved', onPermResolved);

    return () => {
      buildorEvents.off('tool-executing', onToolExec);
      buildorEvents.off('message-received', onMessage);
      buildorEvents.off('permission-required', onPermission);
      buildorEvents.off('user-attention-needed', onAttention);
      buildorEvents.off('error-occurred', onError);
      buildorEvents.off('turn-completed', onTurnComplete);
      buildorEvents.off('permission-resolved', onPermResolved);
    };
  }, [sessionId]);

  return state;
}
