/**
 * 跨标签页数据同步广播（REV-15 的检测层）。
 *
 * ## 背景
 *
 * Dexie 写操作基于内存旧快照整条 `put`，且同版本多标签之间没有内置广播。
 * 两个标签页同时开着时：A 消耗一件 → B 仍持有旧列表；B 再改任意字段就会用
 * 旧快照整条覆盖，A 的消耗**无声消失**（代码路径可证）。
 *
 * ## 本模块做到什么程度
 *
 * 「检测 + 自动重读」：本 tab 每次写库成功后 `broadcastChange()`；
 * **其它** tab 收到消息后重读全部 store 并提示。BroadcastChannel 不会把消息
 * 回送给发送者，天然区分「自己写」与「别人写」。
 *
 * 这**不能**防止并发写互相覆盖（那需要逐字段 merge 或 OT），但把「静默丢失」
 * 变成「最多滞后一个通知周期」，并把用户从「两个窗口数据对不上」的困惑里解救出来。
 * 深度解决（`table.update(id, patch)` 化）留给后续迭代。
 */

const CHANNEL = 'home-steward-data';

let ch: BroadcastChannel | null = null;

function channel(): BroadcastChannel | null {
  // 老 WebView / 测试环境（node）可能没有 BroadcastChannel：静默降级为「无广播」
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!ch) ch = new BroadcastChannel(CHANNEL);
  return ch;
}

/** 本 tab 写库成功后调用：通知其它标签页「数据变了」 */
export function broadcastChange(): void {
  channel()?.postMessage('changed');
}

/**
 * 订阅**其它**标签页的写入通知（BroadcastChannel 不回送发送者，无需过滤自己）。
 * @returns 取消订阅函数
 */
export function onDataChanged(cb: () => void): () => void {
  const c = channel();
  if (!c) return () => {};
  const handler = () => cb();
  c.addEventListener('message', handler);
  return () => c.removeEventListener('message', handler);
}
