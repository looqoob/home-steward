<script setup lang="ts">
import { computed } from 'vue';

/**
 * 批量操作吸底条。
 *
 * 出现在多选态下，替代 FAB 的位置（多选时 FAB 隐藏，避免两个悬浮元素打架）。
 * 视觉与 `ItemCard` 的两个快捷按钮保持同一套尺寸节奏，但这里文字 + 语义色，
 * 因为四个动作并排时图标太难辨。
 */
const props = defineProps<{
  /** 已选中的物品数 */
  count: number;
  /** 当前筛选结果总数，用于「全选」 */
  total: number;
}>();

const emit = defineEmits<{
  (e: 'consume', type: 'consumed' | 'wasted'): void;
  (e: 'move'): void;
  (e: 'remove'): void;
  (e: 'selectAll'): void;
  (e: 'exit'): void;
}>();

const allSelected = computed(() => props.count > 0 && props.count >= props.total);
</script>

<template>
  <div
    class="absolute left-0 right-0 bottom-0 bg-card border-t border-line px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] z-25"
    role="toolbar"
    aria-label="批量操作"
  >
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-[13px] text-ink-1">
        已选 <b class="font-medium">{{ count }}</b> 件
      </span>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="text-[13px] text-primary-700 cursor-pointer"
          :disabled="count === 0"
          @click="emit('selectAll')"
        >{{ allSelected ? '取消全选' : '全选' }}</button>
        <button
          type="button"
          class="text-[13px] text-ink-2 cursor-pointer"
          @click="emit('exit')"
        >完成</button>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-line-strong rounded-md text-[13px] text-primary-700 cursor-pointer min-h-11 disabled:opacity-40"
        :disabled="count === 0"
        @click="emit('consume', 'consumed')"
      >用掉</button>
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-line-strong rounded-md text-[13px] text-danger cursor-pointer min-h-11 disabled:opacity-40"
        :disabled="count === 0"
        @click="emit('consume', 'wasted')"
      >扔掉</button>
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-line-strong rounded-md text-[13px] text-ink-1 cursor-pointer min-h-11 disabled:opacity-40"
        :disabled="count === 0"
        @click="emit('move')"
      >换位置</button>
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-danger rounded-md text-[13px] text-danger cursor-pointer min-h-11 disabled:opacity-40"
        :disabled="count === 0"
        @click="emit('remove')"
      >删除</button>
    </div>
  </div>
</template>
