import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { MainApp } from './windows/main/MainApp';
import { BreakoutApp } from './windows/breakout/BreakoutApp';
import type { PanelType } from './types';
import './styles/global.css';

function parsePanelType(label: string): PanelType {
  // Labels follow pattern: "breakout-{panelType}-{timestamp}"
  const match = label.match(/^breakout-(.+?)-\d+$/);
  if (match) {
    return match[1] as PanelType;
  }
  return 'source-control';
}

async function init() {
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
    } else {
      const panelType = parsePanelType(label);
      root.render(
        <React.StrictMode>
          <BreakoutApp panelType={panelType} />
        </React.StrictMode>
      );
    }
  } catch {
    // Fallback for dev server without Tauri
    root.render(
      <React.StrictMode>
        <MainApp />
      </React.StrictMode>
    );
  }
}

init();
