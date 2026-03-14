/**
 * 日期格式化工具
 */

/**
 * 格式化日期为友好显示
 * @param dateString ISO 8601 格式的日期字符串
 * @returns 格式化后的日期字符串
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  // 检查是否为有效日期
  if (isNaN(date.getTime())) {
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
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 不同年份，显示完整日期
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
