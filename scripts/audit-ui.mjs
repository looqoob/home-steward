#!/usr/bin/env node
/**
 * UI 反模式审计（v1.1 F14 三层防线的机器层）。
 *
 * 背景：视觉模式有组件可用时手写副本，会随批次迭代静默漂移（F11-② 改徽标漏掉
 * StocktakePanel、GroupHead 两处吸顶段头间距各写各的，都是实例）。本脚本 grep
 * 已知反模式，命中即列出位置——新代码绕过组件时在提交前就会被抓住。
 *
 * 用法：`npm run audit:ui`（建议并入提交前自检，与 typecheck/test/build 并列）。
 * 维护约定：**收编一个模式就加一条规则**；规则用「组件外出现即违规」的写法，
 * 组件文件自身要排除（CHECKS 的 `only` 字段限定扫描目录，组件目录单独豁免）。
 *
 * 退出码：有违规 → 1（CI / 提交前可当闸门）；全干净 → 0。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** 每条规则：id / 说明 / 匹配正则 / 扫描范围（only）与豁免文件（except） */
const CHECKS = [
  {
    id: 'freshness-badge',
    why: '新鲜度徽标应使用 <FreshnessBadge>（状态色映射只住组件里；F11-② 曾漏改 StocktakePanel）',
    // 同一行 bg-*-bg + text-*-fg 成对才算徽标；单 bg（行底色 / tone 卡）不是
    re: /bg-(?:over|urgent|soon|fresh)-bg['"][^'"]*text-(?:over|urgent|soon|fresh)-fg|bg-over-solid['"][^'"]*text-over-solid-fg/,
    only: ['views', 'components', 'layouts'],
    except: ['FreshnessBadge.vue', 'StatCard.vue', 'components/README.md'],
  },
  {
    id: 'env-dot',
    why: '环境色点应使用 <EnvDotLabel>（色点尺寸/间距的单一真源）',
    re: /w-1\.5 h-1\.5 rounded-full/,
    only: ['views', 'components', 'layouts'],
    except: ['EnvDotLabel.vue', 'OnboardingOverlay.vue', 'Pill.vue', 'components/README.md'],
  },
  {
    id: 'group-head',
    why: '列表分组段头应使用 <GroupHead>（sticky/plain 两档，间距统一）',
    re: /group-head|sticky top-\[-1px\] z-\[19\]/,
    only: ['views', 'components', 'layouts'],
    except: ['GroupHead.vue', 'components/README.md'],
  },
  {
    id: 'tab-page-skeleton',
    why: 'Tab 页骨架应使用 <TabPageBody>（手写 h-full flex flex-col 会复现 F12 的 pt-4 叠加 bug）',
    re: /class="h-full flex flex-col"|class="h-full overflow-y-auto/,
    only: ['views'],
    except: [],
  },
  {
    id: 'money-format',
    why: '金额展示应使用 domain/price 的 fmtMoney（不要手拼 ¥ + toFixed(2)）',
    re: /¥\$\{|'¥' \+/,
    only: ['views', 'components'],
    except: ['components/README.md'],
  },
  {
    id: 'inline-icon-text',
    why: '左图右文应使用 <IconText> 或 .it CSS 类（间距/对齐规范见 docs/ICON-TEXT-SPEC.md）',
    re: /inline-flex items-center gap-\d(\.\d)?[^"']*>\s*$/,
    only: ['views'],
    except: [],
    /** 弱规则：只提示不算违规（存量场景多，收编节奏渐进） */
    warnOnly: true,
  },
];

/** 递归收集目录下的 .vue/.ts 文件（排除 tests 与自动生成物） */
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collect(p));
    else if (/\.(vue|ts)$/.test(name) && !/__tests__/.test(p)) out.push(p);
  }
  return out;
}

let fails = 0;
let warns = 0;
for (const file of collect(SRC)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const check of CHECKS) {
    if (!check.only.some((d) => rel.startsWith(`src/${d}/`))) continue;
    if (check.except.some((e) => rel.endsWith(e) || rel.includes(e))) continue;
    lines.forEach((line, i) => {
      if (!check.re.test(line)) return;
      // 逐行豁免：本行或**前三行**内写 `audit-ignore: <id>（理由）`。
      // 往前多看两行是为了模板属性（多行 attr 里没法插注释，指令只能放开始标签之前）——
      // 豁免必须带理由，写不出理由的特例就是该抽组件的信号。
      const ctx = lines.slice(Math.max(0, i - 3), i + 1);
      const ignoreRe = new RegExp(`audit-ignore:\\s*${check.id}\\b`);
      if (ctx.some((l) => ignoreRe.test(l))) return;
      const tag = check.warnOnly ? 'WARN' : 'FAIL';
      if (!check.warnOnly) fails++;
      else warns++;
      console.log(`${tag}  ${rel}:${i + 1}  [${check.id}] ${check.why}`);
    });
  }
}

console.log(`\n${fails} 处违规 / ${warns} 处提示（audit-ui，规则见 scripts/audit-ui.mjs 头注释）`);
process.exit(fails > 0 ? 1 : 0);
