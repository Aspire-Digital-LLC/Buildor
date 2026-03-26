import { createContext, useContext } from 'react';
import type { PanelType } from '@/types';

interface TabContextValue {
  projectName?: string;
  panelType: PanelType;
}

const TabContext = createContext<TabContextValue | null>(null);

export function TabContextProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: TabContextValue;
}) {
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

export function useTabContext(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error('useTabContext must be used within a TabContextProvider');
  }
  return ctx;
}
