<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const settings = useSettingsStore();

const timeStr = computed({
  get: () => `${String(settings.settings.remindHour).padStart(2, '0')}:${String(settings.settings.remindMinute).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) settings.patch({ remindHour: h, remindMinute: m });
  },
});

const soonDays = computed({
  get: () => String(settings.settings.soonDays),
  set: (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) settings.patch({ soonDays: Math.round(n) });
  },
});

const urgentDays = computed({
  get: () => String(settings.settings.urgentDays),
  set: (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) settings.patch({ urgentDays: Math.round(n) });
  },
});

async function toggleRemind() {
  await settings.patch({ remindEnabled: !settings.settings.remindEnabled });
}
</script>

<template>
  <div class="screen">
    <NavBar title="提醒设置" show-back @back="router.back()" />

    <div class="body">
      <div class="set-row" style="cursor: default">
        <span>开启临期提醒</span>
        <div
          class="switch"
          :class="{ on: settings.settings.remindEnabled }"
          role="switch"
          :aria-checked="settings.settings.remindEnabled"
          @click="toggleRemind"
        ></div>
      </div>

      <div class="field" style="margin-top: 6px">
        <label>每日提醒时间（原生 App 会在此时推送；网页版需当天打开过一次）</label>
        <input v-model="timeStr" type="time" class="input" style="padding: 0 12px" />
      </div>

      <div class="field">
        <label>临期阈值（剩余 ≤ N 天）</label>
        <input v-model="soonDays" type="number" min="1" class="input" />
      </div>

      <div class="field">
        <label>紧急 / 待吃阈值（剩余 ≤ N 天）</label>
        <input v-model="urgentDays" type="number" min="0" class="input" />
      </div>

      <div class="note">
        网页（PWA）版本没有可靠的后台定时，会在你每次打开 App 时检查并发通知；安装到手机桌面或改用 APK 可获得更稳定的本地定时提醒。
      </div>
    </div>
  </div>
</template>
