import { useState, useCallback } from 'react';
import type { ImageAttachment } from '@/utils/commands/claude';

export interface PendingImage {
  id: string;
  preview: string; // data URL for display
  attachment: ImageAttachment; // base64 data for sending
  name: string;
}

const MAX_IMAGES = 5;

function fileToBase64(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // dataUrl format: "data:image/png;base64,<data>"
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      resolve({ dataUrl, base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function useImageAttachments() {
  const [images, setImages] = useState<PendingImage[]>([]);

  const addImageFromFile = useCallback(async (file: File) => {
    if (!isImageFile(file)) return;
    if (images.length >= MAX_IMAGES) return;

    const { dataUrl, base64, mediaType } = await fileToBase64(file);
    const img: PendingImage = {
      id: crypto.randomUUID(),
      preview: dataUrl,
      attachment: { media_type: mediaType, data: base64 },
      name: file.name,
    };
    setImages((prev) => prev.length >= MAX_IMAGES ? prev : [...prev, img]);
  }, [images.length]);

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
