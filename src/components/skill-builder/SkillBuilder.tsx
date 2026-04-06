import { useCallback, useRef } from 'react';
import { SkillBrowser } from './SkillBrowser';
import { SkillEditor } from './SkillEditor';
import { SkillBuilderChat } from './SkillBuilderChat';

export function SkillBuilder() {
  const chatRef = useRef<{ prefillInput: (text: string) => void }>(null);

  const handleDiscuss = useCallback((field: string, message: string) => {
    const text = `Let's discuss the "${field}" field. The review said: "${message}" — I want to talk about this.`;
    chatRef.current?.prefillInput(text);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Skill Browser */}
      <div style={{
        width: 200,
        borderRight: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <SkillBrowser />
      </div>

      {/* Center: Skill Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SkillEditor onDiscuss={handleDiscuss} />
      </div>

      {/* Right: Chat Assistant */}
      <div style={{
        width: 340,
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <SkillBuilderChat ref={chatRef} />
      </div>
    </div>
  );
}
