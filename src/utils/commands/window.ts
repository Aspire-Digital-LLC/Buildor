import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { PanelType } from '@/types';

export async function openBreakoutWindow(panelType: PanelType, title: string): Promise<WebviewWindow> {
  const label = `breakout-${panelType}-${Date.now()}`;
  const webview = new WebviewWindow(label, {
    url: 'index.html',
    title,
    width: 800,
    height: 600,
  });
  return webview;
}

export async function closeBreakoutWindow(label: string): Promise<void> {
  return invoke('close_breakout_window', { label });
}
