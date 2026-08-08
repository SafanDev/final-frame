"use client";

import { useEffect, useMemo, useRef, useState, type HTMLProps, type UIEvent } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import InlineAlert from "@/components/ui/InlineAlert";
import type { ProjectAsset, ProjectComment } from "@/lib/api/types";

SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("xml", markup);
const MAX_CODE_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_HIGHLIGHT_BYTES = 350 * 1024;
const noopRefresh = async (): Promise<string | null> => null;

const VIRTUAL_LINE_HEIGHT = 22;
const VIRTUAL_OVERSCAN = 24;

interface VirtualCodePreviewProps {
  lines: string[];
  feedbackByLine: ReadonlyMap<number, readonly ProjectComment[]>;
  activeCommentId: string | null;
  pendingLineRange: { start: number; end: number } | null;
}

function VirtualCodePreview({ lines, feedbackByLine, activeCommentId, pendingLineRange }: VirtualCodePreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.height) setViewportHeight(entry.contentRect.height);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const firstLine = Math.max(0, Math.floor(scrollTop / VIRTUAL_LINE_HEIGHT) - VIRTUAL_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / VIRTUAL_LINE_HEIGHT) + VIRTUAL_OVERSCAN * 2;
  const lastLine = Math.min(lines.length, firstLine + visibleCount);
  const visibleLines = lines.slice(firstLine, lastLine);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  return (
    <div
      ref={viewportRef}
      onScroll={handleScroll}
      className="max-h-[70vh] min-h-80 overflow-auto bg-[#050505] font-mono text-[0.8125rem] leading-[1.65] text-zinc-200"
      aria-label="Virtualized source preview"
      data-code-virtual-viewport="true"
    >
      <div className="relative min-w-max" style={{ height: Math.max(VIRTUAL_LINE_HEIGHT, lines.length * VIRTUAL_LINE_HEIGHT) }}>
        <div className="absolute inset-x-0 top-0" style={{ transform: `translateY(${firstLine * VIRTUAL_LINE_HEIGHT}px)` }}>
          {visibleLines.map((line, offset) => {
            const lineNumber = firstLine + offset + 1;
            const feedback = feedbackByLine.get(lineNumber) ?? [];
            const hasActiveFeedback = feedback.some((comment) => comment.id === activeCommentId);
            const isPending = Boolean(pendingLineRange && lineNumber >= pendingLineRange.start && lineNumber <= pendingLineRange.end);
            return (
              <div
                key={lineNumber}
                data-code-line={lineNumber}
                data-code-feedback-count={feedback.length || undefined}
                data-code-feedback-id={feedback[0]?.id}
                data-code-feedback-active={hasActiveFeedback ? "true" : undefined}
                data-code-feedback-pending={isPending ? "true" : undefined}
                className={`flex h-[22px] min-w-full ${feedback.length ? "ff-code-feedback-line" : ""}`}
              >
                <span className="sticky left-0 w-16 shrink-0 select-none border-r border-white/5 bg-[#050505] pr-3 text-right text-zinc-600" aria-hidden="true">{lineNumber}</span>
                <span className="whitespace-pre px-4">{line || " "}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const languages: Readonly<Record<string, string>> = {
  c: "c",
  cpp: "cpp",
  css: "css",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  py: "python",
  ts: "typescript",
  tsx: "tsx",
  xml: "xml",
};

function languageFor(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return languages[extension] ?? "text";
}

interface CodeViewerProps {
  asset: ProjectAsset;
  url?: string;
  onExpired?: () => Promise<string | null>;
  credentials?: RequestCredentials;
  sourceText?: string;
  activeCommentId?: string | null;
  pendingLineRange?: { start: number; end: number } | null;
}

export default function CodeViewer({ asset, url = "", onExpired = noopRefresh, credentials = "include", sourceText, activeCommentId = null, pendingLineRange = null }: CodeViewerProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const feedbackByLine = useMemo(() => {
    const grouped = new Map<number, ProjectComment[]>();
    for (const comment of asset.comments) {
      if (comment.anchorType !== "CODE_RANGE" || comment.lineStart === null) continue;
      const lineComments = grouped.get(comment.lineStart) ?? [];
      lineComments.push(comment);
      grouped.set(comment.lineStart, lineComments);
    }
    return grouped;
  }, [asset.comments]);

  useEffect(() => {
    if (asset.fileSize > MAX_CODE_PREVIEW_BYTES) {
      setIsLoading(false);
      return;
    }

    if (sourceText !== undefined) {
      setContent(sourceText);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!url) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let retried = false;

    async function load(sourceUrl: string) {
      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          credentials,
          cache: "default",
        });
        if (!response.ok) {
          if (!retried && (response.status === 401 || response.status === 403)) {
            retried = true;
            const refreshed = await onExpired();
            if (refreshed) return load(refreshed);
          }
          throw new Error(`Preview request failed with status ${response.status}.`);
        }
        const text = await response.text();
        if (!controller.signal.aborted) setContent(text);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "The source file could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    setContent("");
    setError(null);
    setIsLoading(true);
    void load(url);
    return () => controller.abort();
  }, [asset.fileSize, credentials, onExpired, sourceText, url]);

  if (asset.fileSize > MAX_CODE_PREVIEW_BYTES) {
    return (
      <div className="w-[min(72rem,90vw)] rounded-2xl border border-white/10 bg-[#080808] p-8 text-center">
        <p className="font-bold text-white">Source preview is disabled for large files</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Files larger than 2 MB are not loaded into the browser editor preview. Use the authorised download action instead.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div role="status" className="w-[min(72rem,90vw)] rounded-2xl border border-white/10 bg-[#080808] p-12 text-center text-sm text-zinc-400">Loading source preview…</div>;
  }

  if (error) {
    return <InlineAlert tone="error" title="Source preview unavailable" className="w-[min(42rem,90vw)]">{error}</InlineAlert>;
  }

  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;
  const usePerformancePreview = asset.fileSize > MAX_HIGHLIGHT_BYTES || content.length > MAX_HIGHLIGHT_BYTES;
  return (
    <div className="w-[min(72rem,90vw)] overflow-hidden rounded-xl border border-white/10 bg-[#0b0c0e]" aria-label={`Source preview of ${asset.fileName}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-zinc-500" data-pin-ignore="true">
        <span className="truncate">{asset.fileName}</span>
        <span className="shrink-0">{lineCount} lines{usePerformancePreview ? " · performance mode" : ""}</span>
      </div>
      {usePerformancePreview ? (
        <VirtualCodePreview lines={lines} feedbackByLine={feedbackByLine} activeCommentId={activeCommentId} pendingLineRange={pendingLineRange} />
      ) : (
        <SyntaxHighlighter
          language={languageFor(asset.fileName)}
          style={vscDarkPlus}
          showLineNumbers
          wrapLines
          lineProps={(lineNumber: number) => {
            const feedback = feedbackByLine.get(lineNumber) ?? [];
            const hasActiveFeedback = feedback.some((comment) => comment.id === activeCommentId);
            const isPending = Boolean(pendingLineRange && lineNumber >= pendingLineRange.start && lineNumber <= pendingLineRange.end);
            return {
              "data-code-line": lineNumber,
              "data-code-feedback-count": feedback.length || undefined,
              "data-code-feedback-id": feedback[0]?.id,
              "data-code-feedback-active": hasActiveFeedback ? "true" : undefined,
              "data-code-feedback-pending": isPending ? "true" : undefined,
              className: feedback.length ? "ff-code-feedback-line" : undefined,
            } as HTMLProps<HTMLElement> & {
              "data-code-line": number;
              "data-code-feedback-count"?: number;
              "data-code-feedback-id"?: string;
              "data-code-feedback-active"?: string;
              "data-code-feedback-pending"?: string;
            };
          }}
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            background: "#050505",
            padding: "1.25rem",
            fontSize: "0.8125rem",
            lineHeight: "1.65",
          }}
          codeTagProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
        >
          {content}
        </SyntaxHighlighter>
      )}
    </div>
  );
}
