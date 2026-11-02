import QRCode from 'qrcode';
import type { ProfileData } from './profile';

export const QR_GRASS_GREEN = '#1f4d2b';
const platformLogo = '/brand/rijalalwatan-qr-logo.png';

function loadImage(source: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('image_load_failed')); image.src = source; }); }
function roundedSquare(context: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number) { context.beginPath(); context.moveTo(x + radius, y); context.arcTo(x + size, y, x + size, y + size, radius); context.arcTo(x + size, y + size, x, y + size, radius); context.arcTo(x, y + size, x, y, radius); context.arcTo(x, y, x + size, y, radius); context.closePath(); }

export async function createGreenQr(value: string, logoSource = platformLogo, size = 560) {
  const raw = await QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'H', color: { dark: QR_GRASS_GREEN, light: '#ffffff' } });
  const [code, logo] = await Promise.all([loadImage(raw), loadImage(logoSource)]);
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); if (!context) throw new Error('canvas_unavailable');
  context.drawImage(code, 0, 0, size, size);
  const backing = Math.round(size * 0.22); const x = Math.round((size - backing) / 2); const y = x;
  context.fillStyle = '#ffffff'; roundedSquare(context, x, y, backing, Math.round(backing * 0.14)); context.fill();
  const logoMax = Math.round(size * 0.155); const ratio = Math.min(logoMax / logo.naturalWidth, logoMax / logo.naturalHeight); const width = logo.naturalWidth * ratio; const height = logo.naturalHeight * ratio;
  context.drawImage(logo, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL('image/png');
}

function escapeVcard(value: string) { return value.replace(/[\\;,\n\r]/g, (character) => ({ '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n', '\r': '' })[character] ?? ''); }
export function makeVcard(data: ProfileData, contact: { email: string; phone: string; whatsapp: string }, url: string) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(data.displayName)}`];
  if (data.title) lines.push(`TITLE:${escapeVcard(data.title)}`);
  if (data.showPhone && contact.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(contact.phone)}`);
  if (data.showWhatsapp && contact.whatsapp) lines.push(`TEL;TYPE=HOME:${escapeVcard(contact.whatsapp)}`);
  if (data.showEmail && contact.email) lines.push(`EMAIL:${escapeVcard(contact.email)}`);
  lines.push(`URL:${url}`, 'END:VCARD');
  return lines.join('\r\n');
}

export function downloadDataUrl(dataUrl: string, filename: string) { const anchor = document.createElement('a'); anchor.href = dataUrl; anchor.download = filename; anchor.click(); }
export async function shareDataUrl(dataUrl: string, filename: string, title: string) {
  const response = await fetch(dataUrl); const blob = await response.blob(); const file = new File([blob], filename, { type: 'image/png' });
  const share = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data?: ShareData) => Promise<void> };
  if (share.share && (!share.canShare || share.canShare({ files: [file] }))) { await share.share({ title, files: [file] }); return true; }
  return false;
}
