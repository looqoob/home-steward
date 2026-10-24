<script setup lang="ts">
/**
 * 新用户首启引导（v1.1 F10-5）：3 步讲清本产品三个反直觉的核心概念。
 *
 * 为什么只讲这三条：「环境决定保质期 / 位置只是载体 / 同名折叠 + FEFO」是用户
 * 迁移自「记在脑子里」的旧习惯时最容易困惑的点（「为什么改位置保质期变了」
 * 「两盒牛奶怎么只有一张卡」）。其余能力让用户在使用中自然发现。
 *
 * 出现条件由 App.vue 控制：**首次启动**（本地无物品、无日志、无清单）且
 * 未看过引导（localStorage 标记）。跳过与完成同样生效——引导是介绍不是门槛。
 */
import { ref } from 'vue';

const emit = defineEmits<{ (e: 'done'): void }>();

/** 每步一个大图标（内联 SVG + currentColor，规范见 docs/ICON-TEXT-SPEC.md） */
const STEPS = [
  {
    title: '保质期跟着环境走',
    text: '同一件东西，放冷藏和放冷冻的保质期不一样。App 会按存放环境自动算到期日，放错地方还会提醒你。',
  },
  {
    title: '位置是环境的载体',
    text: '「冰箱冷藏」「冷藏室抽屉」可以是两个位置，环境相同就共享保质期规则。想换个存法，把物资挪个位置就行。',
  },
  {
    title: '同名自动折叠，先吃快过期的',
    text: '两盒牛奶会折成一张卡。打卡片上的 ✓ 消耗时，默认先扣最早到期的那一份，不用自己翻日期。',
  },
] as const;

const step = ref(0);
const isLast = () => step.value === STEPS.length - 1;

function next() {
  if (isLast()) emit('done');
  else step.value += 1;
}
</script>

<template>
  <!--
    全屏遮罩 + 居中卡片。z-[70]：压过 toast 之外的一切（toast 是 z-[60]，
    引导期间没有 toast 的场景，真出现也允许压在上面）。
  -->
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center px-6 bg-[rgba(10,14,12,0.55)]"
    role="dialog"
    aria-modal="true"
    aria-label="使用引导"
  >
    <div class="w-full max-w-[360px] bg-card rounded-2xl p-6 shadow-card">
      <!-- 图标区：当前步的大图标 -->
      <div class="w-16 h-16 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-4">
        <svg class="icon w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <!-- 步骤 1：温度计 + 雪花（环境决定保质期） -->
          <template v-if="step === 0">
            <path d="M10 4a2 2 0 0 1 4 0v9.2a4.5 4.5 0 1 1-4 0z" />
            <circle cx="12" cy="17" r="1.6" />
            <path d="M12 13.5V8" />
            <path d="M19 3v4M17 5h4" />
          </template>
          <!-- 步骤 2：柜格（位置是载体） -->
          <template v-else-if="step === 1">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M12 3v18" />
            <path d="M7 8h2M15 8h2M7 13h2M15 13h2" />
          </template>
          <!-- 步骤 3：叠卡（同名折叠 + FEFO） -->
          <template v-else>
            <rect x="7" y="3.5" width="13" height="17" rx="2" />
            <path d="M4 7.5v11a2 2 0 0 0 2 2h9" />
            <path d="M10.5 13l1.8 1.8 3.2-3.6" />
          </template>
        </svg>
      </div>

      <h2 class="text-[17px] font-semibold text-ink-1 text-center mb-2">{{ STEPS[step].title }}</h2>
      <p class="text-[13px] text-ink-2 leading-relaxed text-center mb-5 min-h-[60px]">{{ STEPS[step].text }}</p>

      <!-- 步骤点：当前步高亮 -->
      <div class="flex items-center justify-center gap-1.5 mb-5" aria-hidden="true">
        <i
          v-for="(_, i) in STEPS"
          :key="i"
          class="w-1.5 h-1.5 rounded-full block transition-colors"
          :class="i === step ? 'bg-primary-600' : 'bg-sunken'"
        ></i>
      </div>

      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="text-[13px] text-ink-3 cursor-pointer min-h-11 px-2"
          @click="emit('done')"
        >跳过</button>
        <button
          type="button"
          data-autofocus
          class="bg-primary-600 text-white text-[14px] font-medium rounded-md cursor-pointer min-h-11 px-8"
          @click="next"
        >{{ isLast() ? '开始使用' : '下一步' }}</button>
      </div>
    </div>
  </div>
</template>
