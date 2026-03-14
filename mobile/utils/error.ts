/**
 * 错误处理工具函数
 */

/**
 * 从未知错误中提取错误消息
 * @param error - 捕获的错误对象
 * @param fallback - 默认错误消息
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown, fallback: string = '操作失败'): string {
  return error instanceof Error ? error.message : fallback;
}