"use client";

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfEngine({ fileUrl, onLoad }: { fileUrl: string, onLoad: (pages: number) => void }) {
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="flex flex-col bg-[#050505]">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => {
          setNumPages(numPages);
          if (onLoad) onLoad(numPages); // Send the total pages back to the Workspace!
        }}
        loading={<div className="text-emerald-500 font-mono text-xs animate-pulse p-20 text-center uppercase tracking-widest">Compiling PDF Engine...</div>}
      >
        {/* Render ALL pages sequentially */}
        {Array.from(new Array(numPages || 0), (el, index) => (
          <div 
            key={`page_${index + 1}`} 
            id={`pdf-page-${index + 1}`} // We use this ID to calculate the exact scroll jump!
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