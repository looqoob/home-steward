<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  /** 确认标题，如「删除物资」 */
  title: string;
  /** 补充说明；破坏性操作请在这里写清后果 */
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮用实心红 */
  danger?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'confirm'): void;
}>();

const confirmBtn = ref<HTMLButtonElement | null>(null);

function cancel() {
  emit('update:modelValue', false);
}

function confirm() {
  emit('update:modelValue', false);
  emit('confirm');
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      // 打开后把焦点移进弹层，否则键盘用户仍在背景内容里
      await nextTick();
      confirmBtn.value?.focus();
      window.addEventListener('keydown', onKey);
    } else {
      window.removeEventListener('keydown', onKey);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="modelValue">
    <div class="absolute inset-0 bg-mask z-28" @click="cancel"></div>
    <div
      class="absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl pt-2 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] z-29 max-h-[86%] overflow-y-auto overscroll-contain no-scrollbar"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title"
    >
      <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
      <h3 class="text-[16px] font-semibold mb-3.5">{{ props.title }}</h3>
      <p v-if="props.message" class="text-[13px] text-ink-2 leading-relaxed mb-4">{{ props.message }}</p>
      <div class="flex gap-2">
        <van-button class="flex-1" @click="cancel">
          {{ props.cancelText || '取消' }}
        </van-button>
        <van-button
          ref="confirmBtn"
          class="flex-1"
          :type="props.danger ? 'danger' : 'primary'"
          @click="confirm"
        >
          {{ props.confirmText || '确认' }}
        </van-button>
      </div>
    </div>
  </div>
</template>
