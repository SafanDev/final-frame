"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

type ReactPdfModule = typeof import("react-pdf");

const pdfRequestOptions = Object.freeze({ withCredentials: true });

interface PdfPageLike {
  getViewport: (options: { scale: number }) => { width: number; height: number };
}

interface PdfDocumentLike {
  numPages: number;
}

interface PdfEngineProps {
  fileUrl?: string;
  fileData?: Uint8Array;
  fileName: string;
  onLoad?: () => void;
  onError?: () => void;
  withCredentials?: boolean;
}

interface LazyPdfPageProps {
  PageComponent: ReactPdfModule["Page"];
  pageNumber: number;
  totalPages: number;
  width: number;
  aspectRatio: number;
  onAspectRatio: (pageNumber: number, ratio: number) => void;
}

function LazyPdfPage({
  PageComponent,
  pageNumber,
  totalPages,
  width,
  aspectRatio,
  onAspectRatio,
}: LazyPdfPageProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);
  const estimatedHeight = Math.max(320, Math.round(width * aspectRatio));

  useEffect(() => {
    if (shouldRender || typeof IntersectionObserver === "undefined") {
      if (!shouldRender) setShouldRender(true);
      return;
    }

    const element = rootRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldRender(true);
      observer.disconnect();
    }, { rootMargin: "900px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden rounded-lg border border-zinc-300/80 bg-white"
      style={{ width, minHeight: estimatedHeight }}
      data-pdf-page={pageNumber}
      aria-label={`Page ${pageNumber} of ${totalPages}`}
    >
      {shouldRender ? (
        <PageComponent
          pageNumber={pageNumber}
          width={width}
          renderTextLayer
          renderAnnotationLayer
          onLoadSuccess={(page: PdfPageLike) => {
            const viewport = page.getViewport({ scale: 1 });
            if (viewport.width > 0) onAspectRatio(pageNumber, viewport.height / viewport.width);
          }}
          devicePixelRatio={Math.min(window.devicePixelRatio, 1.5)}
          className="overflow-hidden rounded-lg bg-white"
          loading={(
            <div
              role="status"
              className="flex items-center justify-center text-sm text-zinc-600"
              style={{ minHeight: estimatedHeight }}
            >
              Rendering page {pageNumber}…
            </div>
          )}
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex items-center justify-center text-sm text-zinc-500"
          style={{ minHeight: estimatedHeight }}
        >
          Page {pageNumber}
        </div>
      )}
      <span
        className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white"
        data-pin-ignore="true"
      >
        {pageNumber}
      </span>
    </section>
  );
}

export default function PdfEngine({ fileUrl = "", fileData, fileName, onLoad, onError, withCredentials = true }: PdfEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfModule, setPdfModule] = useState<ReactPdfModule | null>(null);
  const [moduleError, setModuleError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [pageWidth, setPageWidth] = useState(820);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void import("react-pdf")
      .then((module) => {
        module.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        if (!cancelled) {
          setPdfModule(module);
          setModuleError("");
        }
      })
      .catch(() => {
        if (!cancelled) setModuleError("The PDF viewer could not be loaded in this browser.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => setPageWidth(Math.max(280, Math.min(920, element.clientWidth - 24)));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(0);
    setPageRatios([]);
    setError("");
  }, [fileData, fileUrl]);

  const documentSource = useMemo(() => (fileData ? { data: fileData } : fileUrl), [fileData, fileUrl]);
  const DocumentComponent = pdfModule?.Document;
  const PageComponent = pdfModule?.Page;

  function handleDocumentLoaded(document: PdfDocumentLike) {
    setNumPages(document.numPages);
    setPageRatios(Array.from({ length: document.numPages }, () => 1.414));
    setError("");
    onLoad?.();
  }

  const updatePageRatio = (pageNumber: number, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 10) return;
    setPageRatios((current) => {
      const index = pageNumber - 1;
      if (index < 0 || index >= current.length || Math.abs((current[index] ?? 0) - ratio) < 0.001) return current;
      const next = [...current];
      next[index] = ratio;
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      className="w-[min(62rem,90vw)] rounded-xl border border-white/10 bg-[#101113] p-3"
      aria-label={`Scrollable PDF preview of ${fileName}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2" data-pin-ignore="true">
        <p className="min-w-0 truncate text-sm font-semibold text-zinc-300">{fileName}</p>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{numPages ? `${numPages} page${numPages === 1 ? "" : "s"}` : "Loading…"}</span>
      </div>

      {moduleError ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">{moduleError}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      {!DocumentComponent || !PageComponent ? (
        moduleError ? null : <div role="status" className="p-16 text-center text-sm text-zinc-400">Loading PDF viewer…</div>
      ) : (
        <DocumentComponent
          file={documentSource}
          options={withCredentials && !fileData ? pdfRequestOptions : undefined}
          onLoadSuccess={handleDocumentLoaded}
          onLoadError={() => {
            setError(withCredentials
              ? "The PDF preview could not be opened. A fresh secure preview is being requested."
              : "The local PDF preview could not be opened. The secure review copy will still be prepared.");
            onError?.();
          }}
          loading={<div role="status" className="p-16 text-center text-sm text-zinc-400">Loading PDF…</div>}
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: numPages }, (_, index) => (
            <LazyPdfPage
              key={index + 1}
              PageComponent={PageComponent}
              pageNumber={index + 1}
              totalPages={numPages}
              width={pageWidth}
              aspectRatio={pageRatios[index] ?? 1.414}
              onAspectRatio={updatePageRatio}
            />
          ))}
        </DocumentComponent>
      )}
    </div>
  );
}
