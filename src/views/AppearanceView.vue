<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/composables/useTheme';
import { ACCENT_PRESETS, DEFAULT_ACCENT, THEME_MODES, normalizeHex, resolveAccent } from '@/domain/accent';
import type { ThemeMode } from '@/domain/types';

const router = useRouter();
const settings = useSettingsStore();
const theme = useTheme();

const mode = computed(() => settings.settings.themeMode);
const accent = computed(() => settings.settings.accent);

/**
 * 实际生效的主色：用户选的色可能过浅（白字读不出）或与底色太接近（按钮陷进背景），
 * `resolveAccent` 会自动微调。UI 上要同时显示「生效值」并提示微调过，否则用户以为没生效。
 */
const effective = computed(() => resolveAccent(accent.value, theme.resolved.value));
const isCustom = computed(() => !ACCENT_PRESETS.some((p) => p.hex === accent.value));

async function setMode(m: ThemeMode) {
  if (m === mode.value) return;
  await settings.patch({ themeMode: m });
}

async function setAccent(hex: string) {
  if (hex === accent.value) return;
  await settings.patch({ accent: hex });
}

/*
 * 自定义取色：拖动过程中 `input` 只做**预览**（写 DOM、不落库），松开/确认后的 `change` 才落库。
 * 反过来（每个 input 事件都写 IndexedDB）会在一次拖动里产生几十条写请求。
 */
const picker = ref<HTMLInputElement | null>(null);
const draft = ref(accent.value);
watch(accent, (v) => { draft.value = v; });

function onInput(e: Event) {
  const v = normalizeHex((e.target as HTMLInputElement).value);
  if (!v) return;
  draft.value = v;
  theme.preview(v);
}

async function onChange(e: Event) {
  const v = normalizeHex((e.target as HTMLInputElement).value);
  if (v) await setAccent(v);
}

function openPicker() {
  picker.value?.click();
}

// 预览没落库就离开页面（返回键）时，把颜色恢复成已保存的值
onBeforeUnmount(() => theme.refresh());
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar title="外观与主题" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <!-- 主题模式：三档互斥（跟随系统 / 浅色 / 深色） -->
      <div class="text-[12px] text-ink-3 mt-2 mb-2">主题模式</div>
      <div class="flex gap-1.5 bg-sunken p-1 rounded-full">
        <button
          v-for="m in THEME_MODES"
          :key="m.value"
          type="button"
          class="flex-1 border-0 bg-transparent text-[13px] py-1.5 rounded-full cursor-pointer"
          :class="m.value === mode ? 'bg-card text-primary-700 font-medium shadow-card' : 'text-ink-2'"
          :aria-pressed="m.value === mode"
          @click="setMode(m.value)"
        >{{ m.label }}</button>
      </div>
      <div class="text-[12px] text-ink-3 mt-1.5">
        当前：{{ mode === 'system' ? '跟随系统（' + (theme.resolved.value === 'dark' ? '深色' : '浅色') + '）' : (mode === 'dark' ? '深色' : '浅色') }}
      </div>

      <!-- 主题色：6 个预设 + 自定义 -->
      <div class="text-[12px] text-ink-3 mt-5 mb-2">主题色</div>
      <div class="bg-card border border-line rounded-md p-3">
        <!--
          选中态用「外层圆环 + 内层色块」两元素实现，不用 ring / ring-offset：
          ring-offset 的偏移色默认写死白色，深色模式下会在圆环与色块之间露出一道白边。
        -->
        <div class="flex items-center gap-2.5">
          <span
            v-for="p in ACCENT_PRESETS"
            :key="p.id"
            class="w-[38px] h-[38px] rounded-full flex-none flex items-center justify-center"
            :class="p.hex === accent ? 'bg-[var(--primary-700)]' : 'bg-transparent'"
          >
            <button
              type="button"
              class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border border-line"
              :style="{ background: p.hex }"
              :aria-label="p.name"
              :aria-pressed="p.hex === accent"
              @click="setAccent(p.hex)"
            >
              <!-- 对勾用白色：resolveAccent 保证白字在主色上 ≥4.5:1 -->
              <svg v-if="p.hex === accent" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </span>

          <span
            class="w-[38px] h-[38px] rounded-full flex-none flex items-center justify-center"
            :class="isCustom ? 'bg-[var(--primary-700)]' : 'bg-transparent'"
          >
            <button
              type="button"
              class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border border-line"
              :class="isCustom ? 'text-white' : 'text-ink-2'"
              :style="isCustom ? { background: effective.hex } : undefined"
              aria-label="自定义主题色"
              :aria-pressed="isCustom"
              @click="openPicker"
            >
              <svg v-if="!isCustom" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2z" />
                <circle cx="7.5" cy="11" r="1" fill="currentColor" />
                <circle cx="11" cy="7.5" r="1" fill="currentColor" />
                <circle cx="15.5" cy="9" r="1" fill="currentColor" />
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </span>

          <!-- 原生取色器：视觉隐藏，由上面的圆形按钮触发（项目输入框一律原生，不用 van-field） -->
          <input
            ref="picker"
            type="color"
            class="sr-only"
            :value="draft"
            aria-label="选择自定义主题色"
            @input="onInput"
            @change="onChange"
          />
        </div>

        <div class="flex items-center justify-between gap-2 mt-3 text-[12px]">
          <span class="text-ink-3">
            生效主色 <span class="text-ink-2">{{ effective.hex }}</span>
          </span>
          <button
            type="button"
            class="border-0 bg-transparent text-primary-700 text-[12px] cursor-pointer p-0"
            @click="setAccent(DEFAULT_ACCENT)"
          >恢复默认</button>
        </div>

        <div v-if="effective.adjusted" class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 leading-relaxed mt-2">
          你选的颜色偏浅或偏灰，已自动微调到 {{ effective.hex }}，以保证按钮上的白字与页面底色都有足够对比度。
        </div>
      </div>

      <!-- 实时预览：按钮 / 标签 / 徽章 / 开关 / 禁用态 -->
      <div class="text-[12px] text-ink-3 mt-5 mb-2">预览</div>
      <div class="bg-card border border-line rounded-md p-3.5">
        <div class="flex items-center gap-2 mb-3">
          <van-button type="primary" size="small">主按钮</van-button>
          <van-button size="small">次按钮</van-button>
          <van-button type="primary" size="small" disabled>禁用</van-button>
        </div>
        <div class="flex items-center gap-2 mb-3 text-[13px]">
          <span class="px-2.5 py-1 rounded-full bg-primary-100 text-primary-700">选中标签</span>
          <span class="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[12px]">徽章</span>
          <span class="text-primary-700">强调文字</span>
        </div>
        <div class="flex items-center gap-2">
          <van-switch :model-value="true" size="20px" aria-label="开关预览（只读）" />
          <span class="text-[12px] text-ink-2">开关与焦点环同样跟随主题色</span>
        </div>
      </div>

      <div class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 leading-relaxed mt-3">
        主题色只影响主色系（按钮、选中态、强调文字、焦点环）；环境色（冷藏/冷冻/常温…）与新鲜度标签
        （新鲜/临期/紧急/过期）是语义色，不跟随主题色，以免失去辨识度。
      </div>
    </div>
  </div>
</template>
