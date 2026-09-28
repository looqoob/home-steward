// 本地生成 PWA / APK 图标，不依赖任何外网图标服务。
// 依赖 sharp（已作为 devDependency 安装）。命名需与 index.html、vite.config.ts manifest 一致。
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const BG = '#2E9E6B';
const OUT = resolve('public/icons');
mkdirSync(OUT, { recursive: true });

function iconSvg(size, maskable) {
  const pad = maskable ? 0.1 : 0.25; // 边距占尺寸比例；maskable 内容缩到 80% 居中
  const box = size * (1 - pad * 2);
  const scale = box / 24;
  const ox = (size - box) / 2;
  const oy = (size - box) / 2;
  const rx = maskable ? 0 : size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BG}"/>
  <g transform="translate(${ox} ${oy}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </g>
</svg>`;
}

const jobs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon-180.png', size: 180, maskable: false },
  { file: 'favicon-64.png', size: 64, maskable: false },
];

for (const job of jobs) {
  const svg = iconSvg(job.size, job.maskable);
  await sharp(Buffer.from(svg)).png().toFile(resolve(OUT, job.file));
  console.log('generated', job.file);
}

// 目录里留 .gitkeep：即使图标被清理也能保住目录结构。
// 图标本身会随仓库提交（部署环境不装 sharp 也能直接 npm run build）。
writeFileSync(resolve(OUT, '.gitkeep'), '');
console.log('all icons generated into', OUT);
