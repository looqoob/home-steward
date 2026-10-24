/**
 * 单件消耗动线（v1.1 F14 自 StockView / TodayTodo 抽公用）。
 *
 * 「数量 ≤1 直接执行（一步 + 撤销）、>1 弹层问数量、执行后 toast 带撤销」
 * 这套流程曾在这两处各写一份（TodayTodo 是复制 StockView 的），数量策略
 * 再调整就得改两处——和「双弹层平行路径」（坑位 #69）同一族问题。
 *
 * 用法（页面模板自带一份 ConsumeSheet 装配，绑定下面的 target / confirm）：
 * ```ts
 * const consume = useConsumeFlow();
 * // 列表按钮：consume.ask(item, 'wasted')
 * // 模板：<ConsumeSheet :model-value="consume.target !== null" :item="consume.target?.item ?? null"
 * //        :type="consume.target?.type ?? 'consumed'" @confirm="consume.confirm" />
 * ```
 * 组消耗（多份 FEFO 选份）走 `items.consumeGroup`，不在此列。
 */
import { ref } from 'vue';
import type { ConsumeType, Item } from '@/domain/types';
import { fmtQty } from '@/domain/quantity';
import { useItemsStore } from '@/stores/items';
import { useToast } from '@/composables/useToast';

export function useConsumeFlow() {
  const items = useItemsStore();
  const { show } = useToast();
  /** 待问数量的目标（ConsumeSheet 的开关与数据源） */
  const target = ref<{ item: Item; type: ConsumeType } | null>(null);

  async function run(item: Item, type: ConsumeType, qty?: number) {
    const logId = await items.consume(item.id, type, qty);
    if (!logId) return;
    const verb = type === 'consumed' ? '用掉' : '扔掉';
    show(`已记录${verb}：${item.name} ${fmtQty(qty ?? item.quantity)}${item.unit}`, 2200, {
      text: '撤销',
      run: () => items.undoConsume(logId),
    });
  }

  /**
   * 入口：只剩 1（或更少）时直接执行，保持「一步 + 撤销」的手感；
   * 数量 > 1 时先问数量（20 个鸡蛋一次只用 2 个这种）。
   */
  function ask(item: Item, type: ConsumeType) {
    if (item.quantity <= 1) {
      void run(item, type, item.quantity);
      return;
    }
    target.value = { item, type };
  }

  function confirm(qty: number) {
    const t = target.value;
    target.value = null;
    if (t) void run(t.item, t.type, qty);
  }

  /**
   * ⚠️ 返回**解构形状**而不是打包对象：调用方 `const { target, ask, confirm } = useConsumeFlow()`
   * 解构后 ref 位于 setup 顶层，模板才能自动解包（嵌在普通对象里的 ref 模板不解包，
   * `obj.target?.item` 会拿到 Ref 本体——typecheck 直接报错，别绕回去）。
   */
  return { target, ask, confirm };
}
