export function clampFontSize(value, min = 20, max = 40) {
  return Math.max(min, Math.min(max, value));
}

export function clampSpeed(value, min = 0.5, max = 3) {
  return Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
}

export function togglePauseState(isPaused) {
  return !isPaused;
}

export function shouldStartPan(isPaused, dy, threshold = 5) {
  return isPaused && Math.abs(dy) > threshold;
}

export function isTapAfterPan(hasMoved, dy, threshold = 5) {
  return !hasMoved && Math.abs(dy) < threshold;
}
