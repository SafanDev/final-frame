export interface PointLike {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FitScaleInput {
  stageWidth: number;
  stageHeight: number;
  contentWidth: number;
  contentHeight: number;
  horizontalPadding?: number;
  verticalPadding?: number;
  minimumScale?: number;
  maximumScale?: number;
  mode?: "contain" | "width";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateFitScale({
  stageWidth,
  stageHeight,
  contentWidth,
  contentHeight,
  horizontalPadding = 40,
  verticalPadding = 88,
  minimumScale = 0.35,
  maximumScale = 4,
  mode = "contain",
}: FitScaleInput): number {
  if (![stageWidth, stageHeight, contentWidth, contentHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return clamp(1, minimumScale, maximumScale);
  }

  const availableWidth = Math.max(1, stageWidth - horizontalPadding);
  const availableHeight = Math.max(1, stageHeight - verticalPadding);
  const widthScale = availableWidth / contentWidth;
  const heightScale = availableHeight / contentHeight;
  const target = mode === "width" ? widthScale : Math.min(widthScale, heightScale);
  return clamp(target, minimumScale, maximumScale);
}

export function normalizePointToRect(clientX: number, clientY: number, rect: RectLike): PointLike | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function pointDistance(left: PointLike, right: PointLike): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function pointMidpoint(left: PointLike, right: PointLike): PointLike {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

export function scaleFromPinch(originScale: number, originDistance: number, currentDistance: number, minimumScale = 0.35, maximumScale = 4): number {
  if (![originScale, originDistance, currentDistance].every(Number.isFinite) || originDistance <= 0 || currentDistance <= 0) {
    return clamp(originScale, minimumScale, maximumScale);
  }
  return clamp(originScale * (currentDistance / originDistance), minimumScale, maximumScale);
}
