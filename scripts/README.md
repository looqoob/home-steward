# scripts — 构建辅助脚本

> 本地脚本，**不依赖任何外网服务**（生成图标也是本地 sharp 光栅化 SVG）。这与项目「纯本地、无第三方依赖」的定位一致。

## gen-icons.mjs — 生成 PWA / APK 图标

```bash
npm run icons
```

### 做了什么

用 **sharp** 把内联 SVG 光栅化成 PNG，输出到 **`public/icons/`**：

| 文件 | 尺寸 | maskable | 用途 |
| --- | --- | --- | --- |
| `icon-192.png` | 192 | 否 | manifest 常规图标 |
| `icon-512.png` | 512 | 否 | manifest 常规图标（安装 splash） |
| `icon-maskable-192.png` | 192 | **是** | Android 自适应图标（会被系统裁形） |
| `icon-maskable-512.png` | 512 | **是** | 同上 |
| `apple-touch-icon-180.png` | 180 | 否 | iOS 添加到主屏幕 |
| `favicon-64.png` | 64 | 否 | 浏览器标签页 |

### ⚠️ 为什么必须放 `public/icons/`

放项目根目录的 `icons/` **不会进 `dist`**，workbox 也就预缓存不到，最终表现是：安装到桌面后图标是默认的浏览器图标或空白。

```
public/icons/*.png   →  vite build  →  dist/icons/*.png  →  workbox precache  ✅
icons/*.png          →  (不会被复制)                                        ❌
```

如果发现 `dist/icons/` 为空或预缓存条目变少，先检查这个路径。

### maskable 与常规的区别

```js
const pad = maskable ? 0.1 : 0.25;   // 内容留白比例
const rx  = maskable ? 0 : size * 0.22;  // 圆角
```

- **常规**：内容缩到 50%（pad 0.25 双边），带圆角。
- **maskable**：内容缩到 **80%**（pad 0.1），**无圆角**。因为 Android 会按厂商形状再裁一刀，有效区域只有中心的圆形/水滴形，内容必须往里收。

### 改图标要注意

改 `BG`（品牌绿 `#2E9E6B`）或 SVG path 后：

1. 跑 `npm run icons` 重新生成
2. 跑 `npm run build`
3. **确认 `dist/icons/` 里 6 个文件都在**，且 `dist/sw.js` 的 precache manifest 里包含它们

> 校验小技巧：别用 `curl -w '%{http_code}'` 判断资源是否存在 —— SPA fallback 会把任何路径返回 index.html 并给出 200。要看 `content-type` 是否为 `image/png`。

### 依赖

`sharp` 是 devDependency，**安装失败不影响正常构建**（只有 `npm run icons` 会挂）。已安装版本 `^0.35.4`。

---

## 新增脚本的约定

- 用 `.mjs`（ESM），加 top-level 中文注释说明用途与 nominee 依赖
- 路径一律用 `resolve()` 拼接，**输出目录优先选 `public/` 而非项目根**
- 在 `package.json` 里注册成 npm script，同步更新根 `AGENTS.md` §8 的命令表
