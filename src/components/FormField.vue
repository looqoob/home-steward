<script setup lang="ts">
/**
 * 表单字段容器：标签 + 控件 + 说明文字，统一间距与标签排版。
 *
 * 只管**结构**，不管控件长什么样 —— 控件用 `.field-input` / `.field-textarea`
 * 组件类（见 styles/README.md），这样单价、保质期这类需要自定义解析
 * （`:value` + `@input` 走 priceFromInput）的字段也能用同一套外观，
 * 不必为 v-model 再造一层 parse/format 协议。
 *
 * 用法：
 *   <FormField label="名称" for-id="item-name">
 *     <input id="item-name" v-model="draft.name" class="field-input" />
 *   </FormField>
 */
withDefaults(
  defineProps<{
    /** 标签文字；需要富文本时改用 #label 插槽 */
    label?: string;
    /** 关联控件的 id，让点标签也能聚焦输入框 */
    forId?: string;
    /** 控件下方的补充说明（口径提示等） */
    hint?: string;
    /** 下外边距：normal=14px（默认）/ tight=12px / none（由父级控制） */
    spacing?: 'normal' | 'tight' | 'none';
  }>(),
  { label: '', forId: undefined, hint: '', spacing: 'normal' },
);
</script>

<template>
  <div :class="spacing === 'tight' ? 'mb-3' : spacing === 'none' ? '' : 'mb-3.5'">
    <label v-if="label || $slots.label" class="field-label" :for="forId">
      <slot name="label">{{ label }}</slot>
    </label>
    <slot />
    <div v-if="hint" class="field-hint">{{ hint }}</div>
  </div>
</template>
