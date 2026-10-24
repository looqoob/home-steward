<script setup lang="ts">
/**
 * 环境色点 + 名称标签（v1.1 F14 抽公用）：`● 冷藏` 形态的小标签。
 *
 * 抽出的原因：组卡 / 待办 / 盘点面板三处逐字重复
 * `<i class="w-1.5 h-1.5 rounded-full" :style="ENV_MAP[...].color"> + 位置名`，
 * 色点尺寸改一次要改三处。带 `bg-sunken` 底的变体（组卡 / 待办）是主流用法，
 * 裸色点（盘点面板）用 `bare` 关掉底色。
 *
 * ⚠️ 位置标签的约定（AGENTS §6.2）：**中性灰底 + 彩色圆点，不是彩色底**——
 * 环境色只允许以点的形式出现，整块染色会与新鲜度语义打架。
 */
withDefaults(
  defineProps<{
    /** 环境色（`ENV_MAP[env].color` 之类，调用方传入避免本组件反查依赖） */
    color: string;
    /** 位置 / 环境名称 */
    name: string;
    /**
     * 底色档位：`sunken`（默认，灰底）用于白卡 / 灰底行；
     * `on-tint`（半透明卡底）用于 urgent / over **彩色行**上——纯灰底在彩底上会显脏；
     * `bare` 无底，用于行内已有底色的地方
     */
    tone?: 'sunken' | 'on-tint' | 'bare';
  }>(),
  { tone: 'sunken' },
);

const TONE_CLASS = {
  sunken: 'bg-sunken px-1.5 py-0.5 rounded',
  'on-tint': 'bg-card bg-opacity-70 px-1.5 py-0.5 rounded',
  bare: '',
} as const;
</script>

<template>
  <span class="inline-flex items-center gap-1 text-[12px] text-ink-2" :class="TONE_CLASS[tone]">
    <i class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: color }"></i>{{ name }}
  </span>
</template>
