// ============================================================================
// GLOBAL UTILITY ENGINE
// ============================================================================
// Location: utils/helpers.ts
// Purpose: Consolidates redundant logic for parsing, file typing, sanitation, 
// and   configurations into a single source of truth.
// ============================================================================

// 1. Centralized API Configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// 2. Strict TypeScript Interfaces
export interface ParsedComment {
  text: string;
  timestamp: number | null;
  audioUrl: string | null;
}

export type AssetCategory = 'image' | 'video' | 'pdf' | 'code' | 'unknown';

/**
 * NEW: Cross-Site Scripting (XSS) Sanitization for Emails
 * Escapes malicious HTML injection before sending strings via Resend.
 */
export const escapeHTML = (str: string): string => {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
};

/**
 * Determines the primary asset category based on the file extension.
 */
export const getAssetType = (filename: string): AssetCategory => {
  if (!filename) return 'unknown';
  const cleanName = filename.split('?')[0]; 
  const extension = cleanName.split('.').pop()?.toLowerCase();
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(extension || '')) return 'video';
  if (['pdf'].includes(extension || '')) return 'pdf';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'md'].includes(extension || '')) return 'code';
  
  return 'unknown';
};

/**
 * Maps file extensions to PrismJS supported languages for the Code Viewer.
 */
export const getCodeLanguage = (filename: string): string => {
  if (!filename) return 'javascript';
  const ext = filename.split('?')[0].split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
    'py': 'python', 'html': 'html', 'css': 'css', 'json': 'json',
    'java': 'java', 'cpp': 'cpp', 'c': 'c', 'md': 'markdown'
  };
  return map[ext] || 'javascript';
};

/**
 * Safely parses raw comment strings from the database into structured objects.
 */
export const parseComment = (raw: string): ParsedComment => {
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw);
      if (obj.t !== undefined || obj.audioUrl !== undefined || obj.ts !== undefined) {
        return { 
          text: obj.t || "", 
          timestamp: obj.ts ?? null, 
          audioUrl: obj.audioUrl || null 
        };
      }
    } catch (e) {
      console.warn("Failed to parse rich comment, falling back to raw text.");
    }
  }
  return { text: raw, timestamp: null, audioUrl: null };
};

/**
 * Standardizes date formatting globally so the UI remains consistent.
 */
export const formatAppDate = (dateString: string | Date): string => {
  return new Date(dateString).toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};