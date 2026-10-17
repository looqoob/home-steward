<script setup lang="ts">
/**
 * 底部弹层脚手架。
 *
 * 抽出来的原因：Confirm / Consume / GroupConsume / LocationPicker / QuickAdd / Scan
 * 六个弹层此前各写一份「遮罩 + 圆角面板 + 拖动条 + 标题 + 取消/确认」，连
 * 「Esc 关闭、打开后把焦点移进弹层、卸载时移除监听」这套行为也拷了 4 份。
 * 行为类代码靠注释维持一致是最脆的——顺序改错就是「撤销目标丢失」的运行时 bug。
 *
 * 两种滚动布局由 `fixedFooter` 决定：
 * - `false`（默认）：整块面板滚动，适合「说明 + 若干控件 + 按钮」的短内容
 *   （Confirm / Consume / LocationPicker / Scan）。
 * - `true`：滚动区与按钮条是**兄弟节点**，按钮条永远停在弹层底部、不随内容滚走
 *   （QuickAdd / GroupConsume）。不能用 sticky 实现：sticky 被包含块钳制，
 *   容器 padding 会让按钮条差一个 padding 到不了底边，缝里会漏出滚动内容。
 *
 * 焦点约定：打开后优先聚焦 `[data-autofocus]`（一般是确认按钮）；没有则把焦点移到
 * 对话框容器本身（`tabindex="-1"`），而不是随便抓第一个可聚焦元素 —— 后者会把
 * 长内容弹层（如扫码页）滚动到中间，看起来像"打开就跳了一屏"。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 开关（v-model） */
    modelValue: boolean;
    /** 标题，同时作为对话框的无障碍名称（可由 ariaLabel 覆盖） */
    title: string;
    /** 覆盖 aria-label（标题不足以说明时使用） */
    ariaLabel?: string;
    /** 滚动区 + 固定底栏布局 */
    fixedFooter?: boolean;
    /** 标题下间距：normal = 14px（后接正文）；tight = 4px（后接副标题） */
    titleSpacing?: 'normal' | 'tight';
  }>(),
  { ariaLabel: undefined, fixedFooter: false, titleSpacing: 'normal' },
);

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const panel = ref<HTMLElement | null>(null);

function close() {
  emit('update:modelValue', false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      await nextTick();
      const el = panel.value?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.value;
      el?.focus();
      window.addEventListener('keydown', onKey);
    } else {
      window.removeEventListener('keydown', onKey);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="modelValue">
    <div class="absolute inset-0 bg-mask z-28" @click="close"></div>

    <div
      ref="panel"
      :class="
        fixedFooter
          ? 'absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl z-29 max-h-[86%] flex flex-col focus:outline-none'
          : 'absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl pt-2 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] z-29 max-h-[86%] overflow-y-auto overscroll-contain no-scrollbar focus:outline-none'
      "
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="ariaLabel || title"
    >
      <!-- 固定底栏布局：滚动区与按钮条是兄弟节点（理由见组件头注释） -->
      <div
        v-if="fixedFooter"
        class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar pt-2 px-4"
      >
        <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
        <h3
          class="text-[16px] font-semibold"
          :class="titleSpacing === 'tight' ? 'mb-1' : 'mb-3.5'"
        >{{ title }}</h3>
        <slot />
      </div>

      <template v-else>
        <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
        <h3
          class="text-[16px] font-semibold"
          :class="titleSpacing === 'tight' ? 'mb-1' : 'mb-3.5'"
        >{{ title }}</h3>
        <slot />
      </template>

      <div
        v-if="fixedFooter"
        class="flex-none bg-card px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))] border-t border-line"
      >
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
