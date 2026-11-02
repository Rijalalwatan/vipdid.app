import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'brand');
const sources = {
  logo: '/home/ubuntu/upload/logo.webp',
  dark: '/home/ubuntu/upload/cover-dark-optimized.webp',
  light: '/home/ubuntu/upload/cover-light-optimized.webp'
};

await fs.mkdir(outputDir, { recursive: true });

const { data, info } = await sharp(sources.logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let index = 0; index < data.length; index += 4) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const isNeutralBlack = red < 28 && green < 28 && blue < 28 && Math.max(red, green, blue) - Math.min(red, green, blue) < 12;
  if (isNeutralBlack) data[index + 3] = 0;
}

const alphaLogo = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true });
let quality = 92;
let logoBuffer = await alphaLogo.clone().webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer();
while (logoBuffer.byteLength > 300000 && quality > 68) {
  quality -= 4;
  logoBuffer = await alphaLogo.clone().webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer();
}
if (logoBuffer.byteLength > 300000) throw new Error('The processed logo exceeds 300 KB.');
await fs.writeFile(path.join(outputDir, 'logo.webp'), logoBuffer);
await sharp(logoBuffer).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(path.join(outputDir, 'logo-icon.webp'));
await sharp(logoBuffer).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(path.join(outputDir, 'logo-icon-192.webp'));

async function makeCover(source, destination) {
  await sharp(source)
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 88, effort: 6, smartSubsample: true })
    .toFile(destination);
}

await Promise.all([
  makeCover(sources.dark, path.join(outputDir, 'cover.webp')),
  makeCover(sources.light, path.join(outputDir, 'cover-light.webp'))
]);

const checks = await Promise.all(['logo.webp', 'logo-icon-192.webp', 'logo-icon.webp', 'cover.webp', 'cover-light.webp'].map(async (name) => {
  const target = path.join(outputDir, name);
  const [metadata, stat] = await Promise.all([sharp(target).metadata(), fs.stat(target)]);
  return { name, bytes: stat.size, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha ?? false };
}));
console.log(JSON.stringify(checks));
