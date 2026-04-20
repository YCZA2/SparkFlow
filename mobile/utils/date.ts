/**
 * 日期格式化工具
 */

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDate(dateString: string): Date | null {
  /*统一解析日期字符串，避免各组件重复处理无效时间。 */
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthDay(date: Date): string {
  /*格式化同年日期，保持移动端中文短日期展示一致。 */
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatYearMonthDay(date: Date): string {
  /*格式化跨年日期，供列表分组和相对时间兜底复用。 */
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 格式化日期为友好显示
 * @param dateString ISO 8601 格式的日期字符串
 * @returns 格式化后的日期字符串
 */
export function formatDate(dateString: string): string {
  const date = parseDate(dateString);
  const now = new Date();

  // 检查是否为有效日期
  if (!date) {
    return '未知时间';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // 小于1分钟
  if (diffSecs < 60) {
    return '刚刚';
  }

  // 小于1小时
  if (diffMins < 60) {
    return `${diffMins}分钟前`;
  }

  // 小于24小时
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  // 小于7天
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  // 同一年，显示月日
  if (date.getFullYear() === now.getFullYear()) {
    return formatMonthDay(date);
  }

  // 不同年份，显示完整日期
  return formatYearMonthDay(date);
}

export function formatClockTime(dateString: string): string {
  /*格式化卡片内的短时间标签。 */
  const date = parseDate(dateString);
  if (!date) {
    return '--:--';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatTodayLabel(): string {
  /*格式化当天短日期，供录音等页面标题展示。 */
  return formatMonthDay(new Date());
}

export function formatDateSectionLabel(dateString: string): string {
  /*把日期映射为列表分组标题，统一“今天 / 昨天 / 具体日期”的规则。 */
  const date = parseDate(dateString);
  if (!date) {
    return '更早';
  }

  const today = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((current.getTime() - target.getTime()) / DAY_IN_MS);

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (date.getFullYear() === today.getFullYear()) {
    return formatMonthDay(date);
  }

  return formatYearMonthDay(date);
}

export function formatFullTimestamp(dateString: string): string {
  /*格式化调试日志中的完整本地时间。 */
  const date = parseDate(dateString);
  if (!date) {
    return dateString;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
