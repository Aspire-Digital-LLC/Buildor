import { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useProjectStore } from '@/stores';
import { MainLayout } from '../../components/layout/MainLayout';
import { SourceControl } from '../../components/source-control/SourceControl';
import { CodeViewer } from '../../components/code-viewer/CodeViewer';
import { FlowBuilder } from '../../components/flow-builder/FlowBuilder';
import { ClaudeChat } from '../../components/claude-chat/ClaudeChat';
import { CommandPalette } from '../../components/command-palette/CommandPalette';
import { WorktreeManager } from '../../components/worktree-manager/WorktreeManager';
import { ProjectSwitcher } from '../../components/project-switcher/ProjectSwitcher';

export function MainApp() {
  useEffect(() => {
    useProjectStore.getState().loadProjects();
  }, []);

  return (
    <MemoryRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<SourceControl />} />
          <Route path="/source-control" element={<SourceControl />} />
          <Route path="/code-viewer" element={<CodeViewer />} />
          <Route path="/flow-builder" element={<FlowBuilder />} />
          <Route path="/claude-chat" element={<ClaudeChat />} />
          <Route path="/command-palette" element={<CommandPalette />} />
          <Route path="/worktree-manager" element={<WorktreeManager />} />
          <Route path="/projects" element={<ProjectSwitcher />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
