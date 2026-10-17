<script setup lang="ts">
import BottomSheet from '@/components/BottomSheet.vue';

defineProps<{
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

function setOpen(v: boolean) {
  emit('update:modelValue', v);
}

function cancel() {
  setOpen(false);
}

function confirm() {
  // 顺序要紧：先 confirm 再关闭。若先发 update:modelValue，父组件里「当前处理对象」
  // 会被清空，confirm 处理器拿到的就是 null（撤销目标丢失的坑）。
  emit('confirm');
  setOpen(false);
}
</script>

<template>
  <BottomSheet :model-value="modelValue" :title="title" @update:model-value="setOpen">
    <p v-if="message" class="text-[13px] text-ink-2 leading-relaxed mb-4">{{ message }}</p>
    <div class="flex gap-2">
      <van-button class="flex-1" @click="cancel">
        {{ cancelText || '取消' }}
      </van-button>
      <van-button
        class="flex-1"
        data-autofocus
        :type="danger ? 'danger' : 'primary'"
        @click="confirm"
      >
        {{ confirmText || '确认' }}
      </van-button>
    </div>
  </BottomSheet>
</template>
