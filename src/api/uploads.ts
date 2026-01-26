const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5002/api";

export const uploadApi = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Upload failed");
    }
    return (await response.json()) as { url: string };
  },
};

