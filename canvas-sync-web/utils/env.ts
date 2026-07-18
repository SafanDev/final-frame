// web/utils/env.ts
if (!process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    "FATAL ERROR: NEXT_PUBLIC_API_URL is missing from your frontend .env file. The application cannot boot without knowing where the backend is."
  );
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL;