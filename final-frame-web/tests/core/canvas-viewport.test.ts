import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFitScale,
  normalizePointToRect,
  pointDistance,
  pointMidpoint,
  scaleFromPinch,
} from "../../lib/workspace/canvas-viewport-core.ts";

test("contain fit uses both available width and height", () => {
  assert.equal(calculateFitScale({
    stageWidth: 1_000,
    stageHeight: 700,
    contentWidth: 1_600,
    contentHeight: 900,
    horizontalPadding: 40,
    verticalPadding: 100,
  }), 0.6);
});

test("document fit uses available width without shrinking for total page height", () => {
  assert.equal(calculateFitScale({
    stageWidth: 1_000,
    stageHeight: 700,
    contentWidth: 800,
    contentHeight: 4_000,
    horizontalPadding: 40,
    mode: "width",
  }), 1.2);
});

test("fit scale stays inside canvas zoom limits", () => {
  assert.equal(calculateFitScale({ stageWidth: 100, stageHeight: 100, contentWidth: 10_000, contentHeight: 10_000 }), 0.35);
  assert.equal(calculateFitScale({ stageWidth: 2_000, stageHeight: 2_000, contentWidth: 100, contentHeight: 100 }), 4);
});

test("cursor coordinates are normalized to and clamped within the asset surface", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(normalizePointToRect(300, 150, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(normalizePointToRect(0, 500, rect), { x: 0, y: 1 });
  assert.equal(normalizePointToRect(10, 10, { ...rect, width: 0 }), null);
});

test("pinch helpers calculate stable distance midpoint and bounded scale", () => {
  assert.equal(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(pointMidpoint({ x: 10, y: 20 }, { x: 30, y: 40 }), { x: 20, y: 30 });
  assert.equal(scaleFromPinch(1, 100, 150), 1.5);
  assert.equal(scaleFromPinch(3, 100, 200), 4);
});
