import { ref } from 'vue';

const message = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  function show(text: string, ms = 2200) {
    message.value = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (message.value = ''), ms);
  }
  return { message, show };
}
