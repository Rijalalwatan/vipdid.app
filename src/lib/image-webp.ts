import type { MediaCategory } from './profile';

const dimensions: Record<MediaCategory, { width: number; height: number }> = {
  avatar: { width: 1000, height: 1000 },
  cover: { width: 1600, height: 700 },
  skill: { width: 900, height: 900 },
  portfolio: { width: 1600, height: 1200 }
};

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image_conversion_failed')), 'image/webp', quality));
}

export async function convertToWebP(source: File, category: MediaCategory) {
  if (!source.type.startsWith('image/')) throw new Error('invalid_image');
  if (source.size > 15 * 1024 * 1024) throw new Error('image_too_large');
  const bitmap = await createImageBitmap(source);
  const maximum = dimensions[category];
  const scale = Math.min(1, maximum.width / bitmap.width, maximum.height / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: category === 'avatar' });
  if (!context) throw new Error('image_conversion_failed');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await canvasBlob(canvas, 0.88);
  for (const quality of [0.78, 0.68, 0.58]) {
    if (blob.size <= 2 * 1024 * 1024) break;
    blob = await canvasBlob(canvas, quality);
  }
  if (blob.size > 2 * 1024 * 1024) throw new Error('image_too_large');
  const base = source.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'image';
  return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
}
