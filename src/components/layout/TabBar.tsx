import { useTabStore } from '@/stores';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore();

  if (tabs.length === 0) return null;

  return (
    <div style={{
      height: 36,
      backgroundColor: '#010409',
      borderBottom: '1px solid #21262d',
      display: 'flex',
      alignItems: 'stretch',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'auto',
        flex: 1,
        scrollbarWidth: 'none',
      }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                fontSize: 12,
                color: isActive ? '#e0e0e0' : '#8b949e',
                backgroundColor: isActive ? '#0d1117' : 'transparent',
                borderRight: '1px solid #21262d',
                borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                minWidth: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#161b22';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200,
              }}>
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isActive ? '#8b949e' : '#484f58',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 2px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e0e0e0';
                  e.currentTarget.style.backgroundColor = '#21262d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isActive ? '#8b949e' : '#484f58';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
