import { ref } from 'vue';

const message = ref('');
const action = ref<ToastAction | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export interface ToastAction {
  /** 按钮文案，如「撤销」 */
  text: string;
  /** 点击后执行；执行完 toast 自动关闭 */
  run: () => void;
}

function reset() {
  message.value = '';
  action.value = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function useToast() {
  /**
   * 显示轻提示。
   *
   * - 不带 action 时默认停留 2.2s；
   * - **带 action 时至少停留 5s**，否则用户来不及点「撤销」。
   *
   * @example show('已记录用掉：牛奶', 2200, { text: '撤销', run: undo })
   */
  function show(text: string, ms = 2200, act?: ToastAction) {
    if (timer) clearTimeout(timer);
    message.value = text;
    action.value = act ?? null;
    const duration = act ? Math.max(ms, 5000) : ms;
    timer = setTimeout(reset, duration);
  }

  /** 执行当前 toast 上的动作按钮，然后关闭 */
  function runAction() {
    const act = action.value;
    reset();
    act?.run();
  }

  function close() {
    reset();
  }

  return { message, action, show, runAction, close };
}
