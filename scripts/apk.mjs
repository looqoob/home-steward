#!/usr/bin/env node
/**
 * 跨平台调用 Android Gradle Wrapper。
 *
 * 为什么需要它：`"apk": "cd android && ./gradlew assembleDebug"` 在 Windows 的 cmd 下
 * 必然失败 —— `./gradlew` 不是可执行文件，`cd` 又是 cmd 内建（REV-25）。而 npm script
 * 在 Windows 上走 cmd、在 macOS/Linux 上走 sh，两个平台要调用不同的 wrapper 文件名，
 * 交给 Node 按 `process.platform` 选一次最省事，也不用引入 cross-env 之类的依赖。
 *
 * 用法：
 *   node scripts/apk.mjs                 # = assembleDebug
 *   node scripts/apk.mjs assembleRelease # 需要 android/keystore.properties，见 build.gradle
 *   node scripts/apk.mjs clean assembleDebug
 *
 * @returns {never} 以 Gradle 的退出码退出；失败时给出可操作的提示。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = resolve(root, 'android');
const isWin = process.platform === 'win32';

const args = process.argv.slice(2);
const tasks = args.length > 0 ? args : ['assembleDebug'];

// Windows 用 gradlew.bat（经 cmd 执行），其余平台用 ./gradlew（可执行脚本）
const wrapper = isWin ? 'gradlew.bat' : './gradlew';

const result = spawnSync(wrapper, tasks, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
});

if (result.error) {
  console.error(`[apk] 无法启动 ${wrapper}：${result.error.message}`);
  console.error('[apk] 首次构建需要 JDK 21 + Android SDK（compileSdk 36），见 AGENTS.md §7。');
  process.exit(1);
}

process.exit(result.status ?? 1);
