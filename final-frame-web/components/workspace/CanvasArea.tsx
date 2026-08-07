"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { toast } from "sonner";
import CommentComposer from "@/components/feedback/CommentComposer";
import ImageCompareViewer from "@/components/viewers/ImageCompareViewer";
import AssetViewer from "@/components/viewers/AssetViewer";
import PinPopover from "@/components/workspace/PinPopover";
import RemoteCursorLayer from "@/components/workspace/RemoteCursorLayer";
import SelectMenu from "@/components/ui/SelectMenu";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { useSecureAssetUrl } from "@/hooks/useSecureAssetUrl";
import { getAssetCategory } from "@/lib/assets/file-policy";
import { upsertWorkspaceComment } from "@/lib/workspace/state";
import {
  calculateFitScale,
  normalizePointToRect,
  pointDistance,
  pointMidpoint,
  scaleFromPinch,
} from "@/lib/workspace/canvas-viewport-core";
import { prefetchAssetUrl } from "@/lib/storage/signed-url-cache";
import type { ProjectAsset, ProjectComment } from "@/lib/api/types";

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 4;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function chooseCompareTarget(stack: ProjectAsset[], baseId: string): ProjectAsset | null {
  const baseIndex = stack.findIndex((asset) => asset.id === baseId);
  if (baseIndex >= 0 && stack[baseIndex + 1]) return stack[baseIndex + 1];
  return stack.find((asset) => asset.id !== baseId) ?? null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, summary, [contenteditable='true'], [role='button'], [data-pin-ignore='true']"));
}

function closestDataElement(node: Node | null, selector: string): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>(selector) ?? null;
}

export default function CanvasArea() {
  const {
    project,
    projectId,
    setProject,
    activeAsset,
    activeAssetId,
    setActiveAssetId,
    assetStacks,
    filteredComments,
    isLocked,
    emitCursor,
  } = useWorkspaceData();
  const {
    activePinId,
    setActivePinId,
    isCompareMode,
    setIsCompareMode,
    compareBaseAssetId,
    setCompareBaseAssetId,
    compareTargetAssetId,
    setCompareTargetAssetId,
    openAssetSidebar,
    openFeedbackSidebar,
  } = useWorkspaceUI();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pointerOriginRef = useRef<Point>({ x: 0, y: 0 });
  const positionOriginRef = useRef<Point>({ x: 0, y: 0 });
  const scrollOriginRef = useRef<Point>({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const pinchOriginRef = useRef<{
    distance: number;
    center: Point;
    scale: number;
    position: Point;
    scroll: Point;
  } | null>(null);
  const positionRef = useRef<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const fitPendingRef = useRef(false);
  const resumeVideoAfterPinRef = useRef(false);
  const videoWasPlayingBeforePointerRef = useRef(false);

  const [scale, setScale] = useState(1);
  const [zoomInput, setZoomInput] = useState("100");
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pendingPin, setPendingPin] = useState<Point | null>(null);
  const [pendingApiLocation, setPendingApiLocation] = useState<Point | null>(null);
  const [pendingPageNumber, setPendingPageNumber] = useState<number | null>(null);
  const [pendingLineRange, setPendingLineRange] = useState<{ start: number; end: number } | null>(null);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [commentMarkerPositions, setCommentMarkerPositions] = useState<Record<string, Point>>({});
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const previewReady = activeAsset?.processingStatus === "CLEAN";
  const securePreview = useSecureAssetUrl(previewReady ? activeAsset?.id : null);
  const category = activeAsset ? getAssetCategory(activeAsset) : "other";
  const supportsPins = previewReady && (category === "image" || category === "video" || category === "document" || category === "code");
  const usesScrollableDocument = category === "document" || category === "code";
  const activeStack = useMemo(() => activeAsset
    ? [...(assetStacks[activeAsset.stackKey] ?? [])].filter((asset) => asset.processingStatus === "CLEAN").sort((left, right) => right.version - left.version)
    : [], [activeAsset, assetStacks]);
  const canCompare = category === "image" && activeStack.length > 1;
  const activeComment = useMemo(
    () => activeAsset?.comments.find((comment) => comment.id === activePinId) ?? null,
    [activeAsset, activePinId],
  );

  const compareBase = useMemo(() => {
    if (!canCompare) return null;
    return activeStack.find((asset) => asset.id === compareBaseAssetId)
      ?? activeStack.find((asset) => asset.id === activeAssetId)
      ?? activeStack[0]
      ?? null;
  }, [activeAssetId, activeStack, canCompare, compareBaseAssetId]);

  const compareTarget = useMemo(() => {
    if (!canCompare || !compareBase) return null;
    return activeStack.find((asset) => asset.id === compareTargetAssetId)
      ?? chooseCompareTarget(activeStack, compareBase.id);
  }, [activeStack, canCompare, compareBase, compareTargetAssetId]);

  const updateScale = useCallback((next: number) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    scaleRef.current = clamped;
    setScale(clamped);
    setZoomInput(String(Math.round(clamped * 100)));
  }, []);

  const fitView = useCallback((behavior: ScrollBehavior = "smooth"): boolean => {
    const stage = stageRef.current;
    const surface = surfaceRef.current;
    if (!stage || !surface || surface.offsetWidth <= 0 || surface.offsetHeight <= 0) return false;

    const nextScale = calculateFitScale({
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      contentWidth: surface.offsetWidth,
      contentHeight: surface.offsetHeight,
      minimumScale: MIN_SCALE,
      maximumScale: MAX_SCALE,
      mode: usesScrollableDocument ? "width" : "contain",
    });
    updateScale(nextScale);
    positionRef.current = { x: 0, y: 0 };
    setPosition({ x: 0, y: 0 });

    window.requestAnimationFrame(() => {
      const currentStage = stageRef.current;
      if (!currentStage) return;
      currentStage.scrollTo({
        top: 0,
        left: usesScrollableDocument ? Math.max(0, (currentStage.scrollWidth - currentStage.clientWidth) / 2) : 0,
        behavior,
      });
    });
    return true;
  }, [updateScale, usesScrollableDocument]);

  const resumeVideoIfNeeded = useCallback(() => {
    if (!resumeVideoAfterPinRef.current || !videoRef.current) return;
    resumeVideoAfterPinRef.current = false;
    void videoRef.current.play().catch(() => undefined);
  }, []);

  const cancelPendingPin = useCallback(() => {
    setPendingPin(null);
    setPendingApiLocation(null);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    setPendingTimestamp(null);
    resumeVideoIfNeeded();
  }, [resumeVideoIfNeeded]);

  const pdfPointToSurface = useCallback((pageNumber: number, point: Point): Point | null => {
    const surface = surfaceRef.current;
    const page = surface?.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`);
    if (!surface || !page) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    if (surfaceRect.width <= 0 || surfaceRect.height <= 0 || pageRect.width <= 0 || pageRect.height <= 0) return null;
    return {
      x: clamp((((pageRect.left - surfaceRect.left) + pageRect.width * point.x / 100) / surfaceRect.width) * 100, 0, 100),
      y: clamp((((pageRect.top - surfaceRect.top) + pageRect.height * point.y / 100) / surfaceRect.height) * 100, 0, 100),
    };
  }, []);

  useEffect(() => {
    if (!activeAsset || !supportsPins) {
      setCommentMarkerPositions({});
      return;
    }

    const nextPositions: Record<string, Point> = {};

    for (const comment of activeAsset.comments) {
      if (comment.xPos === null || comment.yPos === null) continue;

      const markerPosition =
        comment.anchorType === "PDF_POINT" && comment.pageNumber !== null
          ? pdfPointToSurface(comment.pageNumber, {
              x: comment.xPos,
              y: comment.yPos,
            })
          : {
              x: comment.xPos,
              y: comment.yPos,
            };

      if (markerPosition) {
        nextPositions[comment.id] = markerPosition;
      }
    }

    setCommentMarkerPositions(nextPositions);
  }, [activeAsset, pdfPointToSurface, supportsPins, surfaceRevision]);
  const movePendingAnchor = useCallback((deltaX: number, deltaY: number) => {
    const move = (current: Point | null) => current ? {
      x: clamp(current.x + deltaX, 0, 100),
      y: clamp(current.y + deltaY, 0, 100),
    } : current;

    if (pendingPageNumber !== null) {
      setPendingApiLocation((current) => {
        const next = move(current);
        if (next) setPendingPin(pdfPointToSurface(pendingPageNumber, next));
        return next;
      });
      return;
    }

    setPendingPin(move);
    setPendingApiLocation(move);
  }, [pdfPointToSurface, pendingPageNumber]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!project?.assets.length || !activeAssetId) return;
    const index = project.assets.findIndex((asset) => asset.id === activeAssetId);
    for (const candidate of [
      project.assets[index - 2],
      project.assets[index - 1],
      project.assets[index + 1],
      project.assets[index + 2],
    ]) {
      if (candidate?.processingStatus === "CLEAN") prefetchAssetUrl(candidate.id);
    }
  }, [activeAssetId, project?.assets]);

  useEffect(() => {
    fitPendingRef.current = true;
    scaleRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setScale(1);
    setZoomInput("100");
    setPosition({ x: 0, y: 0 });
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setPendingPin(null);
    setPendingApiLocation(null);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    setPendingTimestamp(null);
    setActivePinId(null);
    setCurrentVideoTime(0);
    resumeVideoAfterPinRef.current = false;
  }, [activeAssetId, setActivePinId]);

  useEffect(() => {
    if (!activeAssetId) return;
    const stage = stageRef.current;
    const surface = surfaceRef.current;
    if (!stage || !surface || typeof ResizeObserver === "undefined") return;

    const attemptFit = () => {
      if (!fitPendingRef.current) return;
      const image = surface.querySelector("img");
      const video = surface.querySelector("video");
      if (image && !image.complete) return;
      if (video && video.readyState < 1) return;
      if (!image && !video && surface.querySelector('[role="status"]')) return;
      if (fitView("auto")) fitPendingRef.current = false;
    };

    const observer = new ResizeObserver(attemptFit);
    observer.observe(stage);
    observer.observe(surface);
    const frame = window.requestAnimationFrame(attemptFit);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeAssetId, fitView, securePreview.url]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        setSurfaceRevision((current) => current + 1);
      });
    });
    observer.observe(surface);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [activeAssetId]);

  useEffect(() => {
    if (pendingPageNumber === null || !pendingApiLocation) return;
    setPendingPin(pdfPointToSurface(pendingPageNumber, pendingApiLocation));
  }, [pdfPointToSurface, pendingApiLocation, pendingPageNumber, surfaceRevision]);

  useEffect(() => {
    if (!canCompare && isCompareMode) setIsCompareMode(false);
  }, [canCompare, isCompareMode, setIsCompareMode]);

  useEffect(() => {
    if (!isCompareMode || !compareBase) return;
    if (!compareBaseAssetId) setCompareBaseAssetId(compareBase.id);
    if (!compareTargetAssetId && compareTarget) setCompareTargetAssetId(compareTarget.id);
  }, [compareBase, compareBaseAssetId, compareTarget, compareTargetAssetId, isCompareMode, setCompareBaseAssetId, setCompareTargetAssetId]);

  useEffect(() => {
    if (!activeComment || activeComment.xPos === null || activeComment.yPos === null) return;
    if (activeComment.timestamp !== null && videoRef.current) {
      videoRef.current.currentTime = activeComment.timestamp;
      videoRef.current.pause();
    }

    const frame = window.requestAnimationFrame(() => {
      const pin = document.getElementById(`canvas-pin-${activeComment.id}`);
      if (usesScrollableDocument) {
        pin?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      } else {
        const surface = surfaceRef.current;
        if (surface) {
          setPosition({
            x: (0.5 - activeComment.xPos! / 100) * surface.offsetWidth * scale,
            y: (0.5 - activeComment.yPos! / 100) * surface.offsetHeight * scale,
          });
        }
      }
      pin?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeComment, scale, usesScrollableDocument]);

  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space" && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === "?" && !isInteractiveTarget(event.target)) {
        setShowShortcuts((current) => !current);
      }
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space") setIsSpacePressed(false);
    };
    const resetSpace = () => {
      setIsSpacePressed(false);
      setIsPanning(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", resetSpace);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", resetSpace);
    };
  }, []);

  useEffect(() => {
    if (!pendingPin) return;
    const handlePendingPinKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPendingPin();
        return;
      }
      if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      movePendingAnchor(
        event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
        event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
      );
    };
    window.addEventListener("keydown", handlePendingPinKey);
    return () => window.removeEventListener("keydown", handlePendingPinKey);
  }, [cancelPendingPin, movePendingAnchor, pendingPin]);

  function beginPan(point: Point) {
    pointerOriginRef.current = point;
    positionOriginRef.current = positionRef.current;
    scrollOriginRef.current = {
      x: stageRef.current?.scrollLeft ?? 0,
      y: stageRef.current?.scrollTop ?? 0,
    };
    setIsPanning(true);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    movedRef.current = false;
    if (event.button !== 0 || isCompareMode || isInteractiveTarget(event.target)) return;

    if (event.pointerType === "touch") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = Array.from(activePointersRef.current.values());
      if (points.length === 1) {
        pinchOriginRef.current = null;
        beginPan(points[0]);
      } else if (points.length === 2) {
        const center = pointMidpoint(points[0], points[1]);
        pinchOriginRef.current = {
          distance: Math.max(1, pointDistance(points[0], points[1])),
          center,
          scale: scaleRef.current,
          position: positionRef.current,
          scroll: {
            x: stageRef.current?.scrollLeft ?? 0,
            y: stageRef.current?.scrollTop ?? 0,
          },
        };
        setIsPanning(true);
      }
      return;
    }

    if (!isSpacePressed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginPan({ x: event.clientX, y: event.clientY });
  }

  function publishCanvasCursor(event: PointerEvent<HTMLDivElement>) {
    if (!activeAsset) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const point = normalizePointToRect(event.clientX, event.clientY, surface.getBoundingClientRect());
    if (point) emitCursor(activeAsset.id, point.x, point.y);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    publishCanvasCursor(event);

    if (event.pointerType === "touch" && activePointersRef.current.has(event.pointerId)) {
      event.preventDefault();
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = Array.from(activePointersRef.current.values());
      const pinch = pinchOriginRef.current;
      if (points.length >= 2 && pinch) {
        const currentCenter = pointMidpoint(points[0], points[1]);
        const currentDistance = Math.max(1, pointDistance(points[0], points[1]));
        const nextScale = scaleFromPinch(pinch.scale, pinch.distance, currentDistance, MIN_SCALE, MAX_SCALE);
        const deltaX = currentCenter.x - pinch.center.x;
        const deltaY = currentCenter.y - pinch.center.y;
        if (Math.abs(currentDistance - pinch.distance) > 2 || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) movedRef.current = true;
        updateScale(nextScale);
        if (usesScrollableDocument) {
          const stage = stageRef.current;
          if (stage) {
            stage.scrollLeft = pinch.scroll.x - deltaX;
            stage.scrollTop = pinch.scroll.y - deltaY;
          }
        } else {
          const nextPosition = { x: pinch.position.x + deltaX, y: pinch.position.y + deltaY };
          positionRef.current = nextPosition;
          setPosition(nextPosition);
        }
        return;
      }
    }

    if (!isPanning) return;
    const deltaX = event.clientX - pointerOriginRef.current.x;
    const deltaY = event.clientY - pointerOriginRef.current.y;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) movedRef.current = true;
    if (usesScrollableDocument) {
      const stage = stageRef.current;
      if (stage) {
        stage.scrollLeft = scrollOriginRef.current.x - deltaX;
        stage.scrollTop = scrollOriginRef.current.y - deltaY;
      }
      return;
    }
    const nextPosition = {
      x: positionOriginRef.current.x + deltaX,
      y: positionOriginRef.current.y + deltaY,
    };
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      activePointersRef.current.delete(event.pointerId);
      const remaining = Array.from(activePointersRef.current.values());
      pinchOriginRef.current = null;
      if (remaining.length === 1) {
        beginPan(remaining[0]);
      } else if (remaining.length === 0) {
        setIsPanning(false);
      }
      return;
    }

    setIsPanning(false);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (isCompareMode) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      updateScale(scale - event.deltaY * 0.002);
      return;
    }
    if (!usesScrollableDocument) {
      event.preventDefault();
      setPosition((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  }

  function changeAsset(direction: -1 | 1) {
    if (!project?.assets.length || !activeAssetId) return;
    const index = project.assets.findIndex((asset) => asset.id === activeAssetId);
    const next = project.assets[index + direction];
    if (next) setActiveAssetId(next.id);
  }

  function handleStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      cancelPendingPin();
      setActivePinId(null);
      if (isCompareMode) setIsCompareMode(false);
      return;
    }
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      changeAsset(-1);
      return;
    }
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      changeAsset(1);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      updateScale(scale + 0.15);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      updateScale(scale - 0.15);
      return;
    }
    if (event.key === "0" || event.key.toLowerCase() === "f") {
      event.preventDefault();
      fitPendingRef.current = false;
      fitView();
      return;
    }
    if (event.key.toLowerCase() === "p" && supportsPins && !isLocked) {
      event.preventDefault();
      setPendingPageNumber(null);
      setPendingLineRange(null);
      if (category === "code") {
        setPendingPin(null);
        setPendingApiLocation(null);
        setPendingLineRange({ start: 1, end: 1 });
        setPendingTimestamp(null);
      } else if (category === "document") {
        const firstPage = surfaceRef.current?.querySelector<HTMLElement>("[data-pdf-page]");
        const pageNumber = Number(firstPage?.dataset.pdfPage ?? "1");
        const resolvedPageNumber = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
        const pagePoint = { x: 50, y: 50 };
        setPendingPin(pdfPointToSurface(resolvedPageNumber, pagePoint) ?? pagePoint);
        setPendingApiLocation(pagePoint);
        setPendingPageNumber(resolvedPageNumber);
        setPendingTimestamp(null);
      } else {
        setPendingPin({ x: 50, y: 50 });
        setPendingApiLocation({ x: 50, y: 50 });
        setPendingTimestamp(category === "video" ? currentVideoTime : null);
      }
      openFeedbackSidebar();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    if (pendingPin) {
      movePendingAnchor(
        event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
        event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
      );
    } else if (!usesScrollableDocument) {
      const panStep = event.shiftKey ? 80 : 24;
      setPosition((current) => ({
        x: current.x + (event.key === "ArrowRight" ? -panStep : event.key === "ArrowLeft" ? panStep : 0),
        y: current.y + (event.key === "ArrowDown" ? -panStep : event.key === "ArrowUp" ? panStep : 0),
      }));
    }

  }

  function rememberVideoPlaybackBeforePointer(event: PointerEvent<HTMLDivElement>) {
    if (category !== "video" || isSpacePressed || isInteractiveTarget(event.target)) return;
    videoWasPlayingBeforePointerRef.current = Boolean(videoRef.current && !videoRef.current.paused);
  }

  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    if (!supportsPins || isLocked || isCompareMode || movedRef.current || isSpacePressed || isInteractiveTarget(event.target)) return;

    const surfaceRect = event.currentTarget.getBoundingClientRect();
    if (surfaceRect.width <= 0 || surfaceRect.height <= 0) return;
    const selection = window.getSelection();

    if (category === "code") {
      let startLine: number | null = null;
      let endLine: number | null = null;
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const startElement = closestDataElement(selection.anchorNode, "[data-code-line]");
        const endElement = closestDataElement(selection.focusNode, "[data-code-line]");
        const first = Number(startElement?.dataset.codeLine);
        const last = Number(endElement?.dataset.codeLine);
        if (Number.isInteger(first) && first > 0 && Number.isInteger(last) && last > 0) {
          startLine = Math.min(first, last);
          endLine = Math.max(first, last);
        }
      } else {
        const lineElement = closestDataElement(event.target as Node, "[data-code-line]");
        const line = Number(lineElement?.dataset.codeLine);
        if (Number.isInteger(line) && line > 0) startLine = endLine = line;
      }
      if (startLine === null || endLine === null) return;
      setActivePinId(null);
      setPendingPin(null);
      setPendingApiLocation(null);
      setPendingPageNumber(null);
      setPendingLineRange({ start: startLine, end: endLine });
      setPendingTimestamp(null);
      openFeedbackSidebar();
      return;
    }

    if (selection && !selection.isCollapsed && selection.toString().trim()) return;

    if (category === "document") {
      const page = closestDataElement(event.target as Node, "[data-pdf-page]");
      const pageNumber = Number(page?.dataset.pdfPage);
      if (!page || !Number.isInteger(pageNumber) || pageNumber <= 0) return;
      const pageRect = page.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) return;
      setActivePinId(null);
      setPendingPin({
        x: clamp(((event.clientX - surfaceRect.left) / surfaceRect.width) * 100, 0, 100),
        y: clamp(((event.clientY - surfaceRect.top) / surfaceRect.height) * 100, 0, 100),
      });
      setPendingApiLocation({
        x: clamp(((event.clientX - pageRect.left) / pageRect.width) * 100, 0, 100),
        y: clamp(((event.clientY - pageRect.top) / pageRect.height) * 100, 0, 100),
      });
      setPendingPageNumber(pageNumber);
      setPendingLineRange(null);
      setPendingTimestamp(null);
      openFeedbackSidebar();
      return;
    }

    if (category === "video" && videoRef.current) {
      const videoRect = videoRef.current.getBoundingClientRect();
      if (event.clientY >= videoRect.bottom - 54) return;
      event.preventDefault();
      resumeVideoAfterPinRef.current = videoWasPlayingBeforePointerRef.current;
      videoWasPlayingBeforePointerRef.current = false;
      videoRef.current.pause();
      setPendingTimestamp(videoRef.current.currentTime);
    } else {
      setPendingTimestamp(null);
    }

    const point = {
      x: clamp(((event.clientX - surfaceRect.left) / surfaceRect.width) * 100, 0, 100),
      y: clamp(((event.clientY - surfaceRect.top) / surfaceRect.height) * 100, 0, 100),
    };
    setActivePinId(null);
    setPendingPin(point);
    setPendingApiLocation(point);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    openFeedbackSidebar();
  }

  function handleCreated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    setActivePinId(comment.id);
    setPendingPin(null);
    setPendingApiLocation(null);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    setPendingTimestamp(null);
    openFeedbackSidebar();
    resumeVideoAfterPinRef.current = false;
    toast.success("Feedback pinned.");
  }

  function commitZoomInput() {
    const parsed = Number(zoomInput.replace("%", ""));
    if (!Number.isFinite(parsed)) {
      setZoomInput(String(Math.round(scale * 100)));
      return;
    }
    updateScale(parsed / 100);
  }

  if (!project) return null;

  if (!activeAsset) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-[#0a0a0a] p-6 text-center" aria-labelledby="empty-canvas-title">
        <div className="max-w-md rounded-2xl border border-dashed border-white/10 bg-[#101113] p-8">
          <h2 id="empty-canvas-title" className="text-xl font-bold text-white">No file selected</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Choose a project file to begin reviewing.</p>
          <button type="button" onClick={openAssetSidebar} className="mt-5 min-h-11 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-300">Open files</button>
        </div>
      </section>
    );
  }

  const documentStyle: CSSProperties & { zoom?: number } = usesScrollableDocument
    ? { zoom: scale }
    : {
      transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
      transformOrigin: "center center",
      transition: isPanning ? "none" : "transform 100ms ease-out",
    };

  const compareOptions = activeStack.map((asset) => ({
    value: asset.id,
    label: `Version ${asset.version}${asset.id === activeStack[0]?.id ? " · Latest" : ""}`,
  }));
  const hasPendingAnchor = Boolean(pendingPin || pendingLineRange || pendingPageNumber !== null || pendingTimestamp !== null);

  return (
    <section className="ff-workspace-canvas relative flex min-w-0 flex-1 overflow-hidden" aria-label={`Review canvas for ${activeAsset.fileName}`}>
      <div className="ff-canvas-toolbar absolute bottom-3 left-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 rounded-xl p-1 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
        <button type="button" onClick={() => updateScale(scale - 0.15)} disabled={isCompareMode} aria-label="Zoom out" title="Zoom out (-)" className="h-9 w-9 rounded-lg text-lg text-zinc-300 hover:bg-white/5 disabled:opacity-40">−</button>
        <label className="relative">
          <span className="sr-only">Zoom percentage</span>
          <input
            type="text"
            inputMode="numeric"
            value={zoomInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setZoomInput(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={commitZoomInput}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                updateScale(scale + (event.key === "ArrowUp" ? 0.05 : -0.05));
              } else if (event.key === "Home") {
                event.preventDefault();
                updateScale(MIN_SCALE);
              } else if (event.key === "End") {
                event.preventDefault();
                updateScale(MAX_SCALE);
              } else if (event.key === "Enter") {
                event.preventDefault();
                commitZoomInput();
                event.currentTarget.blur();
              }
            }}
            role="spinbutton"
            aria-valuemin={Math.round(MIN_SCALE * 100)}
            aria-valuemax={Math.round(MAX_SCALE * 100)}
            aria-valuenow={Math.round(scale * 100)}
            disabled={isCompareMode}
            className="h-9 w-14 rounded-lg border border-white/10 bg-black/25 px-2 text-center text-sm font-semibold tabular-nums text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-40"
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-zinc-600">%</span>
        </label>
        <button type="button" onClick={() => updateScale(scale + 0.15)} disabled={isCompareMode} aria-label="Zoom in" title="Zoom in (+)" className="h-9 w-9 rounded-lg text-lg text-zinc-300 hover:bg-white/5 disabled:opacity-40">＋</button>
        <button type="button" onClick={() => { fitPendingRef.current = false; fitView(); }} disabled={isCompareMode} aria-label="Fit and reset view" title="Fit view (F or 0)" className="h-9 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40">Fit</button>
        {canCompare ? <button type="button" onClick={() => setIsCompareMode(!isCompareMode)} className={`h-9 rounded-lg px-2.5 text-xs font-bold ${isCompareMode ? "bg-sky-300 text-sky-950" : "text-sky-200 hover:bg-sky-500/10"}`}>{isCompareMode ? "Exit compare" : "Compare"}</button> : null}
      </div>

      <button type="button" onClick={() => setShowShortcuts((current) => !current)} aria-expanded={showShortcuts} aria-label="Show canvas keyboard shortcuts" title="Keyboard shortcuts (?)" className="ff-canvas-toolbar absolute right-3 top-3 z-30 h-9 w-9 rounded-xl text-sm font-bold text-zinc-400 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:text-white">?</button>

      {showShortcuts ? (
        <div className="absolute right-3 top-14 z-40 w-72 rounded-xl border border-white/10 bg-[#111214] p-3 text-sm text-zinc-300 shadow-[0_18px_45px_rgba(0,0,0,0.4)]" data-pin-ignore="true">
          <div className="flex items-center justify-between"><p className="font-bold text-white">Canvas shortcuts</p><button type="button" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts" className="h-8 w-8 rounded-lg text-zinc-500 hover:bg-white/5">×</button></div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs"><dt className="font-mono text-zinc-400">Click</dt><dd>Add pin</dd><dt className="font-mono text-zinc-400">P</dt><dd>Add keyboard pin</dd><dt className="font-mono text-zinc-400">Shift + wheel</dt><dd>Zoom</dd><dt className="font-mono text-zinc-400">Space + drag</dt><dd>Pan any file</dd><dt className="font-mono text-zinc-400">Pinch / drag</dt><dd>Zoom or pan on touch</dd><dt className="font-mono text-zinc-400">Alt + ←/→</dt><dd>Previous or next file</dd><dt className="font-mono text-zinc-400">Alt + arrows</dt><dd>Move a pending pin</dd><dt className="font-mono text-zinc-400">Esc</dt><dd>Cancel or clear selection</dd></dl>
        </div>
      ) : null}

      {isCompareMode && compareBase && compareTarget ? (
        <div className="flex h-full w-full flex-col items-center overflow-auto p-5 pt-16">
          <div className="mb-3 grid w-full max-w-2xl gap-2 sm:grid-cols-2" data-pin-ignore="true">
            <SelectMenu label="Left version" value={compareBase.id} options={compareOptions} onChange={(value) => { setCompareBaseAssetId(value); const next = chooseCompareTarget(activeStack, value); setCompareTargetAssetId(next?.id ?? null); }} />
            <SelectMenu label="Right version" value={compareTarget.id} options={compareOptions.filter((option) => option.value !== compareBase.id)} onChange={setCompareTargetAssetId} />
          </div>
          <ImageCompareViewer base={compareBase} target={compareTarget} />
        </div>
      ) : (
        <div
          ref={stageRef}
          tabIndex={0}
          onPointerDownCapture={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onKeyDown={handleStageKeyDown}
          className={`h-full w-full touch-none p-5 pb-16 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${usesScrollableDocument ? "overflow-auto" : "flex items-center justify-center overflow-hidden"} ${isPanning ? "cursor-grabbing select-none" : isSpacePressed ? "cursor-grab select-none" : supportsPins && !isLocked ? "cursor-crosshair" : "cursor-default"}`}
          aria-label="Asset review canvas. Click the file to add feedback, pinch or use Shift plus the mouse wheel to zoom, and press question mark for shortcuts."
          aria-keyshortcuts="P + - 0 F ? Alt+ArrowLeft Alt+ArrowRight Escape"
        >
          <div style={documentStyle} className={usesScrollableDocument ? "mx-auto w-max origin-top" : "will-change-transform"}>
            <div ref={surfaceRef} onPointerDownCapture={rememberVideoPlaybackBeforePointer} onClick={handleSurfaceClick} className="relative inline-block min-h-1 min-w-1">
              {activeAsset.processingStatus === "CLEAN" ? (
                <AssetViewer
                  asset={activeAsset}
                  url={securePreview.url}
                  isLoading={securePreview.isLoading}
                  error={securePreview.error}
                  videoRef={videoRef}
                  onVideoTimeChange={setCurrentVideoTime}
                  onRefresh={securePreview.refresh}
                />
              ) : (
                <div className="flex min-h-[22rem] w-[min(44rem,82vw)] items-center justify-center rounded-2xl border border-white/10 bg-[#101113] p-8 text-center">
                  <div className="max-w-sm">
                    <div className={`mx-auto h-10 w-10 rounded-full border-2 ${activeAsset.processingStatus === "REJECTED" ? "border-rose-400/60 bg-rose-500/10" : "animate-pulse border-emerald-400/50 bg-emerald-500/10"}`} />
                    <h2 className="mt-4 text-lg font-bold text-white">{activeAsset.processingStatus === "REJECTED" ? "File could not be prepared" : "Preparing secure preview"}</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{activeAsset.processingStatus === "REJECTED" ? activeAsset.processingError ?? "The file failed security or preview processing. The Designer can retry technical failures or upload a replacement." : "FinalFrame is checking the file and creating a safe review copy. This view updates automatically when it is ready."}</p>
                  </div>
                </div>
              )}

              <RemoteCursorLayer assetId={activeAsset.id} scale={scale} />

              {supportsPins ? filteredComments.filter((comment) => comment.xPos !== null && comment.yPos !== null).map((comment, index) => {
                const isDesigner = comment.authorId === project.ownerId;
                const isActive = activePinId === comment.id;
                const markerPosition = commentMarkerPositions[comment.id];
                const visibleAtVideoTime = category !== "video" || comment.timestamp === null || Math.abs(currentVideoTime - comment.timestamp) <= 1.5 || isActive;
                if (!visibleAtVideoTime || !markerPosition) return null;
                return (
                  <button
                    key={comment.id}
                    id={`canvas-pin-${comment.id}`}
                    type="button"
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      setActivePinId(comment.id);
                      openFeedbackSidebar();
                    }}
                    aria-label={`Feedback pin ${index + 1} by ${comment.author?.name ?? "former member"}${comment.isResolved ? ", resolved" : ""}`}
                    aria-pressed={isActive}
                    className={`absolute z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black shadow-md transition focus-visible:ring-4 focus-visible:ring-white/40 ${isDesigner ? "border-white/70 bg-sky-400 text-sky-950" : "border-black/50 bg-emerald-400 text-emerald-950"} ${comment.isResolved ? "opacity-55" : ""} ${isActive ? "ring-4 ring-white/25" : "hover:ring-2 hover:ring-white/20"}`}
                    style={{ left: `${markerPosition.x}%`, top: `${markerPosition.y}%`, transform: `translate(-50%, -50%) scale(${(isActive ? 1.2 : 1) / scale})` }}
                  >
                    {index + 1}
                  </button>
                );
              }) : null}

              {activeComment && activeComment.xPos !== null && activeComment.yPos !== null ? (
                <PinPopover projectId={projectId} comment={activeComment} ownerId={project.ownerId} scale={scale} position={commentMarkerPositions[activeComment.id]} onClose={() => setActivePinId(null)} />
              ) : null}

              {pendingPin ? (
                <div className="pointer-events-none absolute z-30 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-300 text-xs font-black text-amber-950 shadow-md ring-4 ring-amber-300/20" style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, transform: `translate(-50%, -50%) scale(${1 / scale})` }} aria-hidden="true">＋</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {hasPendingAnchor && !isCompareMode ? (
        <div className="absolute inset-x-3 bottom-3 z-40 mx-auto max-w-xl">
          <CommentComposer
            projectId={projectId}
            assetId={activeAsset.id}
            location={pendingApiLocation}
            pageNumber={pendingPageNumber}
            lineStart={pendingLineRange?.start ?? null}
            lineEnd={pendingLineRange?.end ?? null}
            timestamp={pendingTimestamp}
            autoFocus
            compact
            title={pendingLineRange ? "Source feedback" : pendingPageNumber !== null ? "PDF feedback" : "Pinned feedback"}
            submitLabel="Save feedback"
            onCreated={handleCreated}
            onCancel={cancelPendingPin}
          />
          <p className="mt-1 text-center text-xs text-zinc-500">{pendingPin ? "Alt + arrow keys move the anchor. Hold Shift for larger steps. " : ""}Escape cancels.</p>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">Zoom {Math.round(scale * 100)} percent.</span>
    </section>
  );
}
