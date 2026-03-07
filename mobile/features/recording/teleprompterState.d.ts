export function clampFontSize(value: number, min?: number, max?: number): number;
export function clampSpeed(value: number, min?: number, max?: number): number;
export function togglePauseState(isPaused: boolean): boolean;
export function shouldStartPan(isPaused: boolean, dy: number, threshold?: number): boolean;
export function isTapAfterPan(hasMoved: boolean, dy: number, threshold?: number): boolean;
