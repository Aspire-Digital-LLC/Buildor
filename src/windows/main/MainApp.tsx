import { useEffect } from 'react';
import { useProjectStore } from '@/stores';
import { MainLayout } from '../../components/layout/MainLayout';
import { getSyncStatus, syncSkillsRepo } from '@/utils/commands/skillSync';
import { buildorEvents } from '@/utils/buildorEvents';
import { logEvent } from '@/utils/commands/logging';
import '@/utils/sounds'; // Initialize sound event listeners

export function MainApp() {
  useEffect(() => {
    useProjectStore.getState().loadProjects();
  }, []);

  // Auto-sync shared skills repo on startup (non-blocking background)
  useEffect(() => {
    (async () => {
      try {
        const status = await getSyncStatus();
        if (!status.configured) return;
        const startMs = Date.now();
        await syncSkillsRepo();
        buildorEvents.emit('skill-activated', { reason: 'sync' });
        logEvent({
          functionArea: 'system',
          level: 'info',
          operation: 'startup-skills-sync',
          message: 'Auto-synced shared skills repo on startup',
          durationMs: Date.now() - startMs,
        }).catch(() => {});
      } catch (e) {
        logEvent({
          functionArea: 'system',
          level: 'warn',
          operation: 'startup-skills-sync',
          message: `Startup skills sync failed: ${String(e)}`,
        }).catch(() => {});
      }
    })();
  }, []);

  return <MainLayout />;
}
