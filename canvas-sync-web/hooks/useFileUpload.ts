// web/hooks/useFileUpload.ts
import { toast } from "sonner";
import { API_URL } from "@/utils/helpers";

export function useFileUpload() {
  const uploadAsset = async (projectId: string, file: File, originalFileName?: string) => {
    const toastId = toast.loading("Securely uploading asset...");
    
    try {
      // 1. Request signed POST parameters (NO Bearer token, relies on cookies)
      const presignRes = await fetch(`${API_URL}/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileName: file.name, fileType: file.type || "application/octet-stream" }),
      });

      if (!presignRes.ok) throw new Error((await presignRes.json()).error || "Failed to initialize upload.");
      
      // We now expect url & fields for a POST, rather than presignedData for a PUT
      const { url, fields, storageKey } = await presignRes.json();

      // 2. Package file inside FormData to satisfy Cloudflare R2 strict size policies
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
      formData.append("file", file);

      // 3. Upload raw bytes to R2
      const r2UploadRes = await fetch(url, { method: "POST", body: formData });
      if (!r2UploadRes.ok) throw new Error("Failed to transfer file to cloud storage.");

      // 4. Confirm upload with our database
      const confirmRes = await fetch(`${API_URL}/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storageKey, originalFileName: originalFileName || file.name }),
      });

      if (!confirmRes.ok) throw new Error((await confirmRes.json()).error || "Failed to save asset record.");

      const data = await confirmRes.json();
      toast.success("Asset uploaded successfully!", { id: toastId });
      return data;
      
    } catch (error: any) {
      toast.error(error.message || "Upload failed.", { id: toastId });
      throw error;
    }
  };

  return { uploadAsset };
}