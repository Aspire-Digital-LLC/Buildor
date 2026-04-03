import { invoke } from '@tauri-apps/api/core';

/** Save a chat image to disk. Returns the absolute file path. */
export async function saveChatImage(
  sessionId: string,
  name: string,
  base64Data: string,
  mediaType: string,
): Promise<string> {
  return invoke('save_chat_image', { sessionId, name, base64Data, mediaType });
}

/** Read a chat image from disk, returning it as a data URL. */
export async function readChatImage(filePath: string): Promise<string> {
  return invoke('read_chat_image', { filePath });
}

/** Delete all images for a specific chat session. */
export async function deleteSessionImages(sessionId: string): Promise<void> {
  return invoke('delete_session_images', { sessionId });
}
