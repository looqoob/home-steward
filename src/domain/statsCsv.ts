/**
 * 统计导出 CSV（v1.1 F2，纯函数）。
 *
 * 纯本地无账号的前提下，导出文件是与家人共享消费情况的唯一途径。
 * CSV 规则按 Excel 打开不乱码来：
 * - 文件头带 **BOM（\uFEFF）**：Excel 凭它把文件认成 UTF-8，没有它中文必乱码；
 * - 行分隔 `\r\n`、字段含逗号 / 引号 / 换行时用双引号包裹并把内部引号翻倍（RFC 4180）；
 * - 金额保留两位小数、占比一位小数，展示口径与统计页一致（`price` 的 null/0 语义
 *   在 `domain/price` 已定，这里只做格式化，不复算）。
 */

import type { MonthStats, StockValue, WastePoint, WastedTop, CategorySlice } from './stats';
import { round2 } from './price';

/** 统计导出的输入：StatsView 里已有的几块 computed，原样传入 */
export interface StatsCsvInput {
  /** 本月概览的月份标签（'YYYY-MM'） */
  monthLabel: string;
  overview: MonthStats;
  trend: WastePoint[];
  top: WastedTop[];
  categories: CategorySlice[];
  value: StockValue;
}

/** RFC 4180 字段转义：含逗号 / 引号 / 换行的字段用双引号包裹，内部引号翻倍 */
function field(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number)[]): string {
  return cells.map(field).join(',');
}

/**
 * 拼出完整 CSV 文本（含 BOM）。
 *
 * @example
 * buildStatsCsv({ monthLabel: '2026-10', overview, trend: [], top: [], categories: [], value })
 * // → '\uFEFF家庭物资管家 · 统计导出\r\n…'
 */
export function buildStatsCsv(input: StatsCsvInput): string {
  const lines: string[] = [];
  lines.push(row(['家庭物资管家 · 统计导出']));

  lines.push('');
  lines.push(row([`本月概览（${input.monthLabel}）`]));
  lines.push(row(['指标', '数值']));
  lines.push(row(['入库件数', input.overview.inbound]));
  lines.push(row(['消耗数量', input.overview.consumed]));
  lines.push(row(['浪费数量', input.overview.wastedCount]));
  lines.push(row(['浪费金额', round2(input.overview.wastedAmount)]));

  if (input.trend.length) {
    lines.push('');
    lines.push(row(['近月浪费趋势']));
    lines.push(row(['月份', '浪费金额', '浪费数量']));
    for (const t of input.trend) lines.push(row([t.month, round2(t.amount), t.count]));
  }

  if (input.top.length) {
    lines.push('');
    lines.push(row(['最常浪费']));
    lines.push(row(['名称', '数量', '金额']));
    for (const t of input.top) lines.push(row([t.name, t.count, round2(t.amount)]));
  }

  if (input.categories.length) {
    lines.push('');
    lines.push(row(['在库品类分布']));
    lines.push(row(['品类', '数量', '占比']));
    for (const c of input.categories) lines.push(row([c.label, c.count, `${(c.percent * 100).toFixed(1)}%`]));
  }

  lines.push('');
  lines.push(row(['在库物资价值']));
  lines.push(row(['指标', '数值']));
  lines.push(row(['总价值（含已过期）', round2(input.value.total)]));
  lines.push(row(['其中已过期', round2(input.value.overAmount)]));
  lines.push(row(['有单价件数', input.value.priced]));
  lines.push(row(['未填单价件数（未计入金额）', input.value.unpriced]));

  // BOM 必须在最前，Excel 才按 UTF-8 解码
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
