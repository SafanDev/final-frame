"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { toast } from "sonner";
import CommentComposer from "@/components/feedback/CommentComposer";
import Button from "@/components/ui/Button";
import ImageCompareViewer from "@/components/viewers/ImageCompareViewer";
import AssetViewer from "@/components/viewers/AssetViewer";
import CanvasShortcuts from "@/components/workspace/CanvasShortcuts";
import LocalUploadPreview from "@/components/workspace/LocalUploadPreview";
import CanvasToolbar from "@/components/workspace/CanvasToolbar";
import PinPopover from "@/components/workspace/PinPopover";
import RemoteCursorLayer from "@/components/workspace/RemoteCursorLayer";
import SelectMenu from "@/components/ui/SelectMenu";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { useSecureAssetUrl } from "@/hooks/useSecureAssetUrl";
import { getAssetCategory } from "@/lib/assets/file-policy";
import { upsertWorkspaceComment } from "@/lib/workspace/state";
import {
  clearPendingFeedbackAnchor,
  loadPendingFeedbackAnchor,
  loadReviewViewState,
  savePendingFeedbackAnchor,
  saveReviewViewState,
  type PendingFeedbackAnchorMemory,
  type ReviewViewState,
} from "@/lib/workspace/review-session";
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
    isOwner,
    isLocked,
    currentUserId,
    emitCursor,
    localUploadPreview,
    clearLocalUploadPreview,
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
  const restoreViewPendingRef = useRef<ReviewViewState | null>(null);
  const resumeVideoAfterPinRef = useRef(false);
  const videoWasPlayingBeforePointerRef = useRef(false);
  const currentVideoTimeRef = useRef(0);

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
  const [isPinSubmissionInFlight, setIsPinSubmissionInFlight] = useState(false);
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [commentMarkerPositions, setCommentMarkerPositions] = useState<Record<string, Point>>({});
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const previewReady = activeAsset?.processingStatus === "CLEAN";
  const securePreview = useSecureAssetUrl(previewReady ? activeAsset?.id : null);
  const category = activeAsset ? getAssetCategory(activeAsset) : "other";
  const localPreviewCategory = localUploadPreview ? getAssetCategory(localUploadPreview) : "other";
  const showLocalUploadPreview = Boolean(
    localUploadPreview
    && (localUploadPreview.assetId === null || localUploadPreview.assetId === activeAssetId)
    && activeAsset?.processingStatus !== "REJECTED"
    && !(previewReady && securePreview.url),
  );
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
  const nextPinnedCommentNumber = useMemo(
    () => filteredComments.filter((comment) => comment.xPos !== null && comment.yPos !== null).length + 1,
    [filteredComments],
  );

  useEffect(() => {
    if (!localUploadPreview?.assetId || !activeAsset || activeAsset.id !== localUploadPreview.assetId) return;
    if (activeAsset.processingStatus === "REJECTED") {
      clearLocalUploadPreview(localUploadPreview.token);
      return;
    }
    if (activeAsset.processingStatus === "CLEAN" && securePreview.url) {
      clearLocalUploadPreview(localUploadPreview.token);
    }
  }, [activeAsset, clearLocalUploadPreview, localUploadPreview, securePreview.url]);

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

  const rememberPendingAnchor = useCallback((memory: PendingFeedbackAnchorMemory) => {
    if (!activeAssetId) return;
    savePendingFeedbackAnchor(projectId, activeAssetId, memory);
  }, [activeAssetId, projectId]);

  const cancelPendingPin = useCallback(() => {
    setIsPinSubmissionInFlight(false);
    setPendingPin(null);
    setPendingApiLocation(null);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    setPendingTimestamp(null);
    if (activeAssetId) clearPendingFeedbackAnchor(projectId, activeAssetId);
    resumeVideoIfNeeded();
  }, [activeAssetId, projectId, resumeVideoIfNeeded]);

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
        if (next) {
          const surfacePoint = pdfPointToSurface(pendingPageNumber, next);
          setPendingPin(surfacePoint);
          rememberPendingAnchor({
            surfacePoint,
            apiLocation: next,
            pageNumber: pendingPageNumber,
            lineStart: pendingLineRange?.start ?? null,
            lineEnd: pendingLineRange?.end ?? null,
            timestamp: pendingTimestamp,
          });
        }
        return next;
      });
      return;
    }

    setPendingPin((current) => {
      const next = move(current);
      setPendingApiLocation(next);
      if (next) {
        rememberPendingAnchor({
          surfacePoint: next,
          apiLocation: next,
          pageNumber: null,
          lineStart: pendingLineRange?.start ?? null,
          lineEnd: pendingLineRange?.end ?? null,
          timestamp: pendingTimestamp,
        });
      }
      return next;
    });
  }, [pdfPointToSurface, pendingLineRange, pendingPageNumber, pendingTimestamp, rememberPendingAnchor]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    currentVideoTimeRef.current = currentVideoTime;
  }, [currentVideoTime]);

  useEffect(() => {
    if (!activeAssetId) return;
    const rememberedAssetId = activeAssetId;
    const stage = stageRef.current;
    const video = videoRef.current;
    return () => {
      saveReviewViewState(projectId, rememberedAssetId, {
        scale: scaleRef.current,
        positionX: positionRef.current.x,
        positionY: positionRef.current.y,
        scrollLeft: stage?.scrollLeft ?? 0,
        scrollTop: stage?.scrollTop ?? 0,
        videoTime: video?.currentTime ?? currentVideoTimeRef.current,
      });
    };
  }, [activeAssetId, projectId]);

  useEffect(() => {
    if (!activePinId) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const selectionRoot = target.closest<HTMLElement>("[data-feedback-selection]");
      if (selectionRoot?.dataset.feedbackSelection === activePinId) return;
      setActivePinId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [activePinId, setActivePinId]);

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
    const rememberedView = activeAssetId ? loadReviewViewState(projectId, activeAssetId) : null;
    restoreViewPendingRef.current = rememberedView;
    fitPendingRef.current = !rememberedView;

    if (rememberedView) {
      updateScale(rememberedView.scale);
      const rememberedPosition = { x: rememberedView.positionX, y: rememberedView.positionY };
      positionRef.current = rememberedPosition;
      setPosition(rememberedPosition);
      setCurrentVideoTime(rememberedView.videoTime);
    } else {
      scaleRef.current = 1;
      positionRef.current = { x: 0, y: 0 };
      setScale(1);
      setZoomInput("100");
      setPosition({ x: 0, y: 0 });
      setCurrentVideoTime(0);
    }

    const rememberedAnchor = activeAssetId && !isLocked ? loadPendingFeedbackAnchor(projectId, activeAssetId) : null;
    if (activeAssetId && isLocked) clearPendingFeedbackAnchor(projectId, activeAssetId);
    setPendingPin(rememberedAnchor?.surfacePoint ?? null);
    setPendingApiLocation(rememberedAnchor?.apiLocation ?? null);
    setPendingPageNumber(rememberedAnchor?.pageNumber ?? null);
    setPendingLineRange(rememberedAnchor?.lineStart !== null && rememberedAnchor?.lineStart !== undefined
      ? { start: rememberedAnchor.lineStart, end: rememberedAnchor.lineEnd ?? rememberedAnchor.lineStart }
      : null);
    setPendingTimestamp(rememberedAnchor?.timestamp ?? null);
    setIsPinSubmissionInFlight(false);
    setActivePinId(null);
    resumeVideoAfterPinRef.current = false;
  }, [activeAssetId, isLocked, projectId, setActivePinId, updateScale]);

  useEffect(() => {
    if (!activeAssetId) return;
    const stage = stageRef.current;
    const surface = surfaceRef.current;
    if (!stage || !surface || typeof ResizeObserver === "undefined") return;

    const attemptFit = () => {
      const image = surface.querySelector("img");
      const video = surface.querySelector("video");
      if (image && !image.complete) return;
      if (video && video.readyState < 1) return;
      if (!image && !video && surface.querySelector('[role="status"]')) return;

      const rememberedView = restoreViewPendingRef.current;
      if (rememberedView) {
        stage.scrollTo({ top: rememberedView.scrollTop, left: rememberedView.scrollLeft, behavior: "auto" });
        if (video instanceof HTMLVideoElement && rememberedView.videoTime > 0) {
          video.currentTime = Math.min(rememberedView.videoTime, Number.isFinite(video.duration) ? video.duration : rememberedView.videoTime);
        }
        restoreViewPendingRef.current = null;
        fitPendingRef.current = false;
        return;
      }

      if (!fitPendingRef.current) return;
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
    if (!activeComment) return;

    if (activeComment.anchorType === "CODE_RANGE" && activeComment.lineStart !== null) {
      const lineNumber = activeComment.lineStart;
      const frame = window.requestAnimationFrame(() => {
        const surface = surfaceRef.current;
        if (!surface) return;
        const virtualViewport = surface.querySelector<HTMLElement>("[data-code-virtual-viewport='true']");
        if (virtualViewport) {
          virtualViewport.scrollTo({
            top: Math.max(0, (lineNumber - 1) * 22 - virtualViewport.clientHeight * 0.35),
            behavior: "smooth",
          });
          window.requestAnimationFrame(() => {
            surface.querySelector<HTMLElement>(`[data-code-line="${lineNumber}"]`)
              ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          });
          return;
        }
        surface.querySelector<HTMLElement>(`[data-code-line="${lineNumber}"]`)
          ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (activeComment.xPos === null || activeComment.yPos === null) return;
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


  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (isCompareMode) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault();
        updateScale(scaleRef.current - event.deltaY * 0.002);
        return;
      }
      if (!usesScrollableDocument) {
        event.preventDefault();
        setPosition((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [isCompareMode, updateScale, usesScrollableDocument]);

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
    if (event.key.toLowerCase() === "p" && supportsPins && !isLocked && !isPinSubmissionInFlight) {
      event.preventDefault();
      setPendingPageNumber(null);
      setPendingLineRange(null);
      if (category === "document") {
        const firstPage = surfaceRef.current?.querySelector<HTMLElement>("[data-pdf-page]");
        const pageNumber = Number(firstPage?.dataset.pdfPage ?? "1");
        const resolvedPageNumber = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
        const pagePoint = { x: 50, y: 50 };
        const surfacePoint = pdfPointToSurface(resolvedPageNumber, pagePoint) ?? pagePoint;
        setPendingPin(surfacePoint);
        setPendingApiLocation(pagePoint);
        setPendingPageNumber(resolvedPageNumber);
        setPendingTimestamp(null);
        rememberPendingAnchor({ surfacePoint, apiLocation: pagePoint, pageNumber: resolvedPageNumber, lineStart: null, lineEnd: null, timestamp: null });
      } else {
        const point = { x: 50, y: 50 };
        const timestamp = category === "video" ? currentVideoTime : null;
        setPendingPin(point);
        setPendingApiLocation(point);
        setPendingTimestamp(timestamp);
        rememberPendingAnchor({ surfacePoint: point, apiLocation: point, pageNumber: null, lineStart: null, lineEnd: null, timestamp });
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
    if (isPinSubmissionInFlight || !supportsPins || isLocked || isCompareMode || movedRef.current || isSpacePressed || isInteractiveTarget(event.target)) return;

    const surfaceRect = event.currentTarget.getBoundingClientRect();
    if (surfaceRect.width <= 0 || surfaceRect.height <= 0) return;
    const selection = window.getSelection();

    if (activePinId) {
      setActivePinId(null);
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
      const surfacePoint = {
        x: clamp(((event.clientX - surfaceRect.left) / surfaceRect.width) * 100, 0, 100),
        y: clamp(((event.clientY - surfaceRect.top) / surfaceRect.height) * 100, 0, 100),
      };
      const pagePoint = {
        x: clamp(((event.clientX - pageRect.left) / pageRect.width) * 100, 0, 100),
        y: clamp(((event.clientY - pageRect.top) / pageRect.height) * 100, 0, 100),
      };
      setPendingPin(surfacePoint);
      setPendingApiLocation(pagePoint);
      setPendingPageNumber(pageNumber);
      setPendingLineRange(null);
      setPendingTimestamp(null);
      rememberPendingAnchor({ surfacePoint, apiLocation: pagePoint, pageNumber, lineStart: null, lineEnd: null, timestamp: null });
      openFeedbackSidebar();
      return;
    }

    let timestamp: number | null = null;
    if (category === "video" && videoRef.current) {
      const videoRect = videoRef.current.getBoundingClientRect();
      if (event.clientY >= videoRect.bottom - 54) return;
      event.preventDefault();
      resumeVideoAfterPinRef.current = videoWasPlayingBeforePointerRef.current;
      videoWasPlayingBeforePointerRef.current = false;
      videoRef.current.pause();
      timestamp = videoRef.current.currentTime;
      setPendingTimestamp(timestamp);
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
    rememberPendingAnchor({ surfacePoint: point, apiLocation: point, pageNumber: null, lineStart: null, lineEnd: null, timestamp });
    openFeedbackSidebar();
  }

  function handlePinSubmitStart() {
    setIsPinSubmissionInFlight(true);
    // Resume from the captured timestamp from this Save gesture. The pending pin
    // stays visible as an optimistic marker while persistence finishes.
    resumeVideoIfNeeded();
  }

  function handlePinSubmitError() {
    // Keep the exact pending anchor and reveal the composer again with its error.
    setIsPinSubmissionInFlight(false);
  }

  function handleCreated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    // Saving feedback never steals focus. The new pin stays visible and can be
    // selected explicitly later on any file type.
    setActivePinId(null);
    setPendingPin(null);
    setPendingApiLocation(null);
    setPendingPageNumber(null);
    setPendingLineRange(null);
    setPendingTimestamp(null);
    if (activeAssetId) clearPendingFeedbackAnchor(projectId, activeAssetId);
    setIsPinSubmissionInFlight(false);
    openFeedbackSidebar();
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

  if (showLocalUploadPreview && localUploadPreview) {
    const localIsScrollable = localPreviewCategory === "document" || localPreviewCategory === "code";
    return (
      <section className="ff-workspace-canvas relative flex min-w-0 flex-1 overflow-hidden" aria-label={`Local preview of ${localUploadPreview.fileName}`}>
        <div className="ff-workspace-local-preview-state" role="status" aria-live="polite">
          <span className="ff-workspace-local-preview-dot" aria-hidden="true" />
          <strong>Local preview</strong>
          <span>{localUploadPreview.assetId ? "Securing shared copy…" : "Uploading securely…"}</span>
        </div>
        <div className={`ff-workspace-stage ${localIsScrollable ? "is-scrollable" : "is-centered"}`}>
          <div className="ff-workspace-local-preview-surface">
            <LocalUploadPreview preview={localUploadPreview} projectId={projectId} />
          </div>
        </div>
      </section>
    );
  }

  if (!activeAsset) {
    return (
      <section className="ff-workspace-empty-canvas" aria-labelledby="empty-canvas-title">
        <div>
          <span aria-hidden="true" className="ff-workspace-empty-mark">◇</span>
          <h2 id="empty-canvas-title">Choose a file</h2>
          <p>Select a file from the left to start reviewing.</p>
          <Button type="button" size="sm" variant="secondary" onClick={openAssetSidebar}>Open files</Button>
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
      <CanvasToolbar
        scale={scale}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        zoomInput={zoomInput}
        setZoomInput={setZoomInput}
        commitZoomInput={commitZoomInput}
        updateScale={updateScale}
        fitView={() => { fitPendingRef.current = false; fitView(); }}
        isCompareMode={isCompareMode}
        canCompare={canCompare}
        setIsCompareMode={setIsCompareMode}
      />

      <button
        type="button"
        onClick={() => setShowShortcuts((current) => !current)}
        aria-expanded={showShortcuts}
        aria-label="Show canvas keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="ff-canvas-help"
        data-pin-ignore="true"
      >
        ?
      </button>

      {showShortcuts ? <CanvasShortcuts onClose={() => setShowShortcuts(false)} /> : null}

      {isCompareMode && compareBase && compareTarget ? (
        <div className="ff-workspace-compare-view">
          <div className="ff-workspace-compare-selectors" data-pin-ignore="true">
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
          onKeyDown={handleStageKeyDown}
          className={`ff-workspace-stage ${usesScrollableDocument ? "is-scrollable" : "is-centered"} ${isPanning ? "cursor-grabbing select-none" : isSpacePressed ? "cursor-grab select-none" : supportsPins && !isLocked ? "cursor-crosshair" : "cursor-default"}`}
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
                  onVideoTimeChange={(time) => { currentVideoTimeRef.current = time; setCurrentVideoTime(time); }}
                  onRefresh={securePreview.refresh}
                  activeCommentId={activePinId}
                  pendingLineRange={pendingLineRange}
                />
              ) : (
                <div className={`ff-workspace-processing ${activeAsset.processingStatus === "REJECTED" ? "is-error" : "is-pending"}`} role="status" aria-live="polite">
                  <span className="ff-workspace-processing-mark" aria-hidden="true" />
                  <h2>{activeAsset.processingStatus === "REJECTED" ? "Preview unavailable" : "Preparing preview"}</h2>
                  <p>{activeAsset.processingStatus === "REJECTED" ? activeAsset.processingError ?? "This file could not be prepared." : "It will open here as soon as it is ready."}</p>
                  {activeAsset.processingStatus === "REJECTED" ? <Button type="button" size="sm" variant="secondary" onClick={openAssetSidebar}>File options</Button> : <small>Checking automatically</small>}
                </div>
              )}

              <RemoteCursorLayer assetId={activeAsset.id} scale={scale} />

              {supportsPins ? filteredComments.filter((comment) => comment.xPos !== null && comment.yPos !== null).map((comment, index) => {
                const isOwnerComment = comment.authorId === project.ownerId;
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
                      setActivePinId(activePinId === comment.id ? null : comment.id);
                      openFeedbackSidebar();
                    }}
                    data-feedback-selection={comment.id}
                    aria-label={`Feedback pin ${index + 1} by ${comment.author?.name ?? "former member"}${comment.isResolved ? ", resolved" : ""}`}
                    aria-pressed={isActive}
                    className={`ff-feedback-pin ${isOwnerComment ? "is-designer" : "is-client"} ${comment.isResolved ? "is-resolved" : ""} ${isActive ? "is-active" : ""}`}
                    style={{ left: `${markerPosition.x}%`, top: `${markerPosition.y}%`, transform: `translate(-50%, -50%) scale(${(isActive ? 1.08 : 1) / scale})` }}
                  >
                    <span>{index + 1}</span>
                  </button>
                );
              }) : null}

              {activeComment && activeComment.xPos !== null && activeComment.yPos !== null ? (
                <PinPopover projectId={projectId} comment={activeComment} ownerId={project.ownerId} scale={scale} position={commentMarkerPositions[activeComment.id]} onClose={() => setActivePinId(null)} />
              ) : null}

              {pendingPin ? (
                <div
                  className={`ff-feedback-pin is-pending ${isPinSubmissionInFlight ? (isOwner ? "is-designer" : "is-client") : "is-draft"}`}
                  style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                  aria-hidden="true"
                >
                  <span>{isPinSubmissionInFlight ? nextPinnedCommentNumber : "+"}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {hasPendingAnchor && !isCompareMode ? (
        <div className="ff-workspace-pending-feedback">
          <div className={isPinSubmissionInFlight ? "hidden" : undefined}>
            <CommentComposer
              projectId={projectId}
              assetId={activeAsset.id}
              currentUserId={currentUserId ?? "anonymous"}
              location={pendingApiLocation}
              pageNumber={pendingPageNumber}
              lineStart={pendingLineRange?.start ?? null}
              lineEnd={pendingLineRange?.end ?? null}
              timestamp={pendingTimestamp}
              autoFocus
              compact
              title="Add feedback"
              placeholder="What should change here?"
              submitLabel="Save"
              onCreated={handleCreated}
              onSubmitStart={handlePinSubmitStart}
              onSubmitError={handlePinSubmitError}
              onCancel={cancelPendingPin}
            />
            <p className="sr-only">{pendingPin ? "Alt plus arrow keys move the pin. " : ""}Escape cancels feedback.</p>
          </div>
          {isPinSubmissionInFlight ? <span className="sr-only" role="status">Saving feedback.</span> : null}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">Zoom {Math.round(scale * 100)} percent.</span>
    </section>
  );
}
