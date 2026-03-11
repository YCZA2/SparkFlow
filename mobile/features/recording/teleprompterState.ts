export function clampFontSize(value: number, min = 20, max = 40): number {
  /*把提词字号限制在可读范围，避免误触后界面失控。 */
  return Math.max(min, Math.min(max, value));
}

export function clampSpeed(value: number, min = 0.5, max = 3): number {
  /*统一限制并规整滚动速度，保持控制面板与动画时长一致。 */
  return Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
}

export function togglePauseState(isPaused: boolean): boolean {
  /*以纯函数形式翻转暂停态，方便测试和手势复用。 */
  return !isPaused;
}

export function shouldStartPan(isPaused: boolean, dy: number, threshold = 5): boolean {
  /*仅在暂停状态下允许拖拽重定位，避免滚动播放时抢占手势。 */
  return isPaused && Math.abs(dy) > threshold;
}

export function isTapAfterPan(hasMoved: boolean, dy: number, threshold = 5): boolean {
  /*把轻触和拖拽释放区分开，避免误把拖拽结束识别为点击。 */
  return !hasMoved && Math.abs(dy) < threshold;
}
