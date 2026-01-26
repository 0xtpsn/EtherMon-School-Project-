const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5002/api";

export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = RequestInit & { skipJson?: boolean };

export async function apiFetch<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipJson, headers, ...rest } = options;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      ...rest,
    });

    if (!response.ok) {
      let message = response.statusText;
      let details: any;
      try {
        const payload = await response.json();
        message = payload.error || message;
        details = payload;
      } catch {
        // ignore
      }
      // Provide friendlier messaging for common cases
      if (response.status === 429) {
        throw new ApiError(
          "You've reached the limit for this action. Please try again in about an hour.",
          response.status,
          details
        );
      }
      throw new ApiError(message, response.status, details);
    }

    if (skipJson || response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new ApiError(
        "Unable to connect to server. Please check your internet connection and try again.",
        0,
        { networkError: true }
      );
    }
    throw error;
  }
}

const apiClient = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};

type ApiClient = typeof apiClient;

export const api: ApiClient = apiClient as ApiClient;

