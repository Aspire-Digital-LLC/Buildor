import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { MainApp } from './windows/main/MainApp';
import { BreakoutApp } from './windows/breakout/BreakoutApp';
import { ClaudeChatWindow } from './windows/claude/ClaudeChatWindow';
import { getAppInfo } from './utils/commands/config';
import { setAppInfoForPrompt } from './utils/buildSystemPrompt';
import type { PanelType } from './types';
import './styles/global.css';

function parsePanelType(label: string): PanelType {
  const match = label.match(/^breakout-(.+?)-\d+$/);
  if (match) {
    return match[1] as PanelType;
  }
  return 'source-control';
}

async function init() {
  // Cache app info for system prompts before rendering
  try {
    const info = await getAppInfo();
    setAppInfoForPrompt(info);
  } catch { /* non-fatal */ }

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  try {
    const appWindow = getCurrentWebviewWindow();
    const label = appWindow.label;

    if (label === 'main') {
      root.render(
        <React.StrictMode>
          <MainApp />
        </React.StrictMode>
      );
    } else if (label.startsWith('claude-')) {
      root.render(
        <React.StrictMode>
          <ClaudeChatWindow />
        </React.StrictMode>
      );
    } else {
      const panelType = parsePanelType(label);
      root.render(
        <React.StrictMode>
          <BreakoutApp panelType={panelType} />
        </React.StrictMode>
      );
    }
  } catch {
    root.render(
      <React.StrictMode>
        <MainApp />
      </React.StrictMode>
    );
  }
}

init();
