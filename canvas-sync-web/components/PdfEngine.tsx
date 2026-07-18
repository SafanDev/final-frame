// web/components/PdfEngine.tsx
"use client";

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// PHASE 4: Localized Worker. App no longer crashes if Unpkg CDN goes down.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

export default function PdfEngine({ fileUrl, onLoad }: { fileUrl: string, onLoad: (pages: number) => void }) {
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="flex flex-col bg-[#050505]">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => {
          setNumPages(numPages);
          if (onLoad) onLoad(numPages); 
        }}
        loading={<div className="text-emerald-500 font-mono text-xs animate-pulse p-20 text-center uppercase tracking-widest">Compiling PDF Engine...</div>}
      >
        {Array.from(new Array(numPages || 0), (el, index) => (
          <div 
            key={`page_${index + 1}`} 
            id={`pdf-page-${index + 1}`}
            className="bg-white border-b-8 border-[#0a0a0a] shadow-2xl"
          >
            <Page
              pageNumber={index + 1}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              width={800} 
            />
          </div>
        ))}
      </Document>
    </div>
  );
}