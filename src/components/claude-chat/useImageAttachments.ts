import { useState, useCallback } from 'react';
import type { ImageAttachment } from '@/utils/commands/claude';
import { saveChatImage } from '@/utils/commands/chatImages';

export interface PendingImage {
  id: string;
  preview: string; // data URL for display
  attachment: ImageAttachment; // base64 data for sending
  name: string;
  filePath?: string; // path on disk after save
}

const MAX_IMAGES = 5;
const COMPRESS_THRESHOLD = 35 * 1024; // 35KB in bytes

function fileToBase64(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      resolve({ dataUrl, base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Compress an image via canvas if its base64 data exceeds the threshold */
async function maybeCompress(
  dataUrl: string,
  base64: string,
  mediaType: string,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  const byteSize = Math.ceil(base64.length * 3 / 4);
  if (byteSize <= COMPRESS_THRESHOLD) {
    return { dataUrl, base64, mediaType };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if very large — target max 1200px on longest side
      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try progressively lower quality until under threshold
      let quality = 0.8;
      let resultUrl = canvas.toDataURL('image/jpeg', quality);
      let resultB64 = resultUrl.split(',')[1];

      while (Math.ceil(resultB64.length * 3 / 4) > COMPRESS_THRESHOLD && quality > 0.3) {
        quality -= 0.1;
        resultUrl = canvas.toDataURL('image/jpeg', quality);
        resultB64 = resultUrl.split(',')[1];
      }

      resolve({ dataUrl: resultUrl, base64: resultB64, mediaType: 'image/jpeg' });
    };
    img.onerror = () => {
      // Can't compress — use original
      resolve({ dataUrl, base64, mediaType });
    };
    img.src = dataUrl;
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function useImageAttachments(sessionId?: string) {
  const [images, setImages] = useState<PendingImage[]>([]);

  const addImageFromFile = useCallback(async (file: File) => {
    if (!isImageFile(file)) return;
    if (images.length >= MAX_IMAGES) return;

    const raw = await fileToBase64(file);
    const { dataUrl, base64, mediaType } = await maybeCompress(raw.dataUrl, raw.base64, raw.mediaType);

    // Save to disk if we have a session ID
    let filePath: string | undefined;
    if (sessionId) {
      try {
        filePath = await saveChatImage(sessionId, file.name, base64, mediaType);
      } catch {
        // Best effort — image still works in-memory
      }
    }

    const img: PendingImage = {
      id: crypto.randomUUID(),
      preview: dataUrl,
      attachment: { media_type: mediaType, data: base64 },
      name: file.name,
      filePath,
    };
    setImages((prev) => prev.length >= MAX_IMAGES ? prev : [...prev, img]);
  }, [images.length, sessionId]);

  const addImagesFromClipboard = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return false;

    let handled = false;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await addImageFromFile(file);
          handled = true;
        }
      }
    }
    return handled;
  }, [addImageFromFile]);

  const addImagesFromDrop = useCallback(async (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (isImageFile(file)) {
        await addImageFromFile(file);
      }
    }
  }, [addImageFromFile]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const getAttachments = useCallback((): ImageAttachment[] => {
    return images.map((img) => img.attachment);
  }, [images]);

  return {
    images,
    addImageFromFile,
    addImagesFromClipboard,
    addImagesFromDrop,
    removeImage,
    clearImages,
    getAttachments,
    hasImages: images.length > 0,
  };
}
