import { jsPDF } from 'jspdf';
import { createGreenQr } from './qr';
import { publicUrl, type ProfileData, type ProfileMedia } from './profile';

type Locale = 'ar' | 'en';
type Payload = { locale: Locale; data: ProfileData; media: ProfileMedia[]; contact: { email: string; phone: string; whatsapp: string }; slug: string };
type PdfWithArabic = jsPDF & { processArabic?: (value: string) => string };
const labels = {
  ar: { profile: 'الهوية المهنية', resume: 'السيرة الذاتية', about: 'النبذة', experience: 'الخبرات', education: 'المؤهلات', courses: 'الدورات', skills: 'المهارات', languages: 'اللغات', achievements: 'الإنجازات', awards: 'الجوائز والتكريمات', portfolio: 'الأعمال', services: 'الخدمات', contact: 'التواصل', website: 'الموقع' },
  en: { profile: 'Professional Identity', resume: 'Résumé', about: 'About', experience: 'Experience', education: 'Education', courses: 'Courses', skills: 'Skills', languages: 'Languages', achievements: 'Achievements', awards: 'Awards and recognition', portfolio: 'Portfolio', services: 'Services', contact: 'Contact', website: 'Website' }
};

function base64(bytes: ArrayBuffer) { let raw = ''; const view = new Uint8Array(bytes); for (const byte of view) raw += String.fromCharCode(byte); return btoa(raw); }
async function prepareFont(document: PdfWithArabic, locale: Locale) { if (locale !== 'ar') { document.setFont('helvetica', 'normal'); return; } const [regular, bold] = await Promise.all(['/fonts/Tajawal-Regular.ttf', '/fonts/Tajawal-Bold.ttf'].map(async (url) => { const response = await fetch(url); if (!response.ok) throw new Error('font_load_failed'); return base64(await response.arrayBuffer()); })); document.addFileToVFS('Tajawal-Regular.ttf', regular); document.addFileToVFS('Tajawal-Bold.ttf', bold); document.addFont('Tajawal-Regular.ttf', 'Tajawal', 'normal'); document.addFont('Tajawal-Bold.ttf', 'Tajawal', 'bold'); document.setFont('Tajawal', 'normal'); document.setR2L(true); }
function process(document: PdfWithArabic, value: string, locale: Locale) { return locale === 'ar' && document.processArabic ? document.processArabic(value) : value; }
function align(locale: Locale) { return locale === 'ar' ? 'right' : 'left'; }
function family(locale: Locale) { return locale === 'ar' ? 'Tajawal' : 'helvetica'; }
function imageData(url: string) { return fetch(url).then(async (response) => { if (!response.ok) throw new Error('image_load_failed'); const blob = await response.blob(); return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('image_load_failed')); reader.readAsDataURL(blob); }); }); }
function firstMedia(media: ProfileMedia[], category: ProfileMedia['category']) { return media.find((item) => item.category === category)?.url; }
function lines(value: string) { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function addWrapped(document: PdfWithArabic, value: string, x: number, y: number, width: number, locale: Locale, lineHeight = 6) { const wrapped = document.splitTextToSize(process(document, value, locale), width) as string[]; for (const line of wrapped) { if (y > 280) { document.addPage(); y = 20; } document.text(line, x, y, { align: align(locale) }); y += lineHeight; } return y; }
function addSection(document: PdfWithArabic, title: string, value: string, x: number, y: number, width: number, locale: Locale) { if (!value.trim()) return y; if (y > 270) { document.addPage(); y = 20; } document.setFont(family(locale), 'bold'); document.setFontSize(13); document.setTextColor(31, 77, 43); document.text(process(document, title, locale), x, y, { align: align(locale) }); document.setFont(family(locale), 'normal'); document.setFontSize(10.5); document.setTextColor(35, 35, 35); return addWrapped(document, value, x, y + 7, width, locale) + 6; }
function contactLine(payload: Payload) { const values = [payload.contact.email, payload.contact.phone, payload.contact.whatsapp].filter(Boolean); return values.join('  •  '); }

export async function generateProfessionalPdf(payload: Payload) {
  const { locale, data, media, slug } = payload; const copy = labels[locale]; const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfWithArabic; await prepareFont(doc, locale);
  const dirX = locale === 'ar' ? 195 : 15; const heroHeight = 63; const cover = firstMedia(media, 'cover') ?? '/brand/cover.webp'; const avatar = firstMedia(media, 'avatar');
  try { doc.addImage(await imageData(cover), 'WEBP', 0, 0, 210, heroHeight); } catch { doc.setFillColor(24, 31, 31); doc.rect(0, 0, 210, heroHeight, 'F'); }
  doc.setFillColor(10, 19, 18, 0.6); doc.rect(0, 0, 210, heroHeight, 'F');
  doc.setTextColor(255, 248, 225); doc.setFont(family(locale), 'bold'); doc.setFontSize(22); doc.text(process(doc, data.displayName, locale), dirX, 27, { align: align(locale) }); doc.setFont(family(locale), 'normal'); doc.setFontSize(12); doc.text(process(doc, data.title || copy.profile, locale), dirX, 38, { align: align(locale) });
  if (avatar) { try { doc.setFillColor(255, 255, 255); doc.circle(locale === 'ar' ? 174 : 36, 60, 19, 'F'); doc.addImage(await imageData(avatar), 'WEBP', locale === 'ar' ? 156 : 18, 42, 36, 36); } catch { /* visual asset is optional */ } }
  doc.setTextColor(35, 35, 35); let y = 82; const x = locale === 'ar' ? 195 : 15; const width = 180;
  y = addSection(doc, copy.about, data.bio, x, y, width, locale); y = addSection(doc, copy.experience, data.experiences, x, y, width, locale); y = addSection(doc, copy.skills, data.skills, x, y, width, locale); y = addSection(doc, copy.portfolio, data.portfolio, x, y, width, locale); y = addSection(doc, copy.services, data.services, x, y, width, locale);
  doc.addPage(); const qr = await createGreenQr(publicUrl(slug), undefined, 240); doc.addImage(qr, 'PNG', locale === 'ar' ? 15 : 165, 20, 38, 38); doc.setFontSize(9); doc.setTextColor(70, 70, 70); doc.text(process(doc, publicUrl(slug), locale), locale === 'ar' ? 58 : 152, 40, { align: locale === 'ar' ? 'left' : 'right' });
  doc.save(locale === 'ar' ? 'الهوية-المهنية.pdf' : 'professional-identity.pdf');
}

export async function generateAtsResume(payload: Payload) {
  const { locale, data, slug } = payload; const copy = labels[locale]; const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfWithArabic; await prepareFont(doc, locale); const x = locale === 'ar' ? 195 : 15; const width = 180;
  doc.setFont(family(locale), 'bold'); doc.setFontSize(20); doc.setTextColor(25, 25, 25); doc.text(process(doc, data.displayName, locale), x, 20, { align: align(locale) }); doc.setFont(family(locale), 'normal'); doc.setFontSize(11); doc.setTextColor(60, 60, 60); doc.text(process(doc, data.title, locale), x, 28, { align: align(locale) });
  let y = 38; const contact = contactLine(payload); if (contact) { doc.text(process(doc, contact, locale), x, y, { align: align(locale) }); y += 7; } doc.text(process(doc, `${copy.website}: ${publicUrl(slug)}`, locale), x, y, { align: align(locale) }); y += 10;
  y = addSection(doc, copy.about, data.bio, x, y, width, locale); y = addSection(doc, copy.experience, data.experiences, x, y, width, locale); y = addSection(doc, copy.education, data.education, x, y, width, locale); y = addSection(doc, copy.courses, data.courses, x, y, width, locale); y = addSection(doc, copy.skills, lines(data.skills).join(', '), x, y, width, locale); y = addSection(doc, copy.languages, data.languages, x, y, width, locale); y = addSection(doc, copy.achievements, data.achievements, x, y, width, locale); addSection(doc, copy.awards, data.awards, x, y, width, locale);
  doc.save(locale === 'ar' ? 'السيرة-الذاتية.pdf' : 'ats-resume.pdf');
}
