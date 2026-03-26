import { useEffect } from 'react';
import { useProjectStore } from '@/stores';
import { MainLayout } from '../../components/layout/MainLayout';

export function MainApp() {
  useEffect(() => {
    useProjectStore.getState().loadProjects();
  }, []);

  return <MainLayout />;
}
