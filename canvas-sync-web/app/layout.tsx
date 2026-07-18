// web/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/utils/env"; // PHASE 4: Boot-time ENV validation
import Navbar from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";
import { Toaster } from "sonner"; 

const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter", 
});

export const metadata: Metadata = {
  title: "FinalFrame | Design Approval Engine",
  description: "Real-time, spatial design review and client approval platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} scroll-smooth`}>
      <body className="min-h-screen flex flex-col relative bg-[#050505] text-zinc-100 font-sans antialiased selection:bg-emerald-500 selection:text-[#050505]">
        <AuthProvider>
          <Toaster 
            position="top-center" 
            theme="dark" 
            richColors 
            toastOptions={{
              style: {
                background: '#0a0a0a',
                border: '1px solid #27272a',
                color: '#f4f4f5',
                fontFamily: 'var(--font-inter), sans-serif',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontSize: '11px',
                fontWeight: 'bold',
              },
            }}
          />
          <Navbar />
          <main className="flex-1 w-full flex flex-col relative z-10">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}