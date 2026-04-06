import { useEffect } from 'react';
import { useProjectStore } from '@/stores';
import { MainLayout } from '../../components/layout/MainLayout';
import '@/utils/sounds'; // Initialize sound event listeners

export function MainApp() {
  useEffect(() => {
    useProjectStore.getState().loadProjects();
  }, []);

  return <MainLayout />;
}
