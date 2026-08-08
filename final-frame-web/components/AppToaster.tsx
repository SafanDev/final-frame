"use client";

import { Toaster } from "sonner";

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      theme="dark"
      richColors
      closeButton
      expand
      toastOptions={{
        classNames: {
          toast: "finalframe-toast",
          title: "finalframe-toast-title",
          description: "finalframe-toast-description",
        },
      }}
    />
  );
}