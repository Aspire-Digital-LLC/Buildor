import { SkillBrowser } from './SkillBrowser';
import { SkillEditor } from './SkillEditor';
import { SkillBuilderChat } from './SkillBuilderChat';

export function SkillBuilder() {
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
        <SkillEditor />
      </div>

      {/* Right: Chat Assistant */}
      <div style={{
        width: 340,
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <SkillBuilderChat />
      </div>
    </div>
  );
}
