import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  ApiResponse,
  AuthTokens,
  Document,
  DocumentSummary,
  UploadResult,
  AnalysisResult,
  AudioSegment,
  UsageStats,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// ─── Axios instance ───────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
});

// Attach JWT token from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ultimoversio_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
      // Add custom header for CSRF protection
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
    }
  }
  return config;
});

// Handle 401 globally — but NOT on auth endpoints (those 401s carry the real error message)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
      localStorage.removeItem('ultimoversio_token');
      localStorage.removeItem('ultimoversio_user');
      window.location.href = '/login';
    }
    // Surface the server's error message instead of generic axios text
    const serverMsg = error.response?.data?.error;
    if (serverMsg) {
      return Promise.reject(new Error(serverMsg));
    }
    return Promise.reject(error);
  }
);

// ─── Helper ───────────────────────────────────────────────────────────────────

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: async (payload: { name: string; email: string; password: string }): Promise<AuthTokens> => {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/auth/register', payload);
    return unwrap(data);
  },

  login: async (payload: { email: string; password: string }): Promise<AuthTokens> => {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/auth/login', payload);
    return unwrap(data);
  },

  me: async (): Promise<AuthTokens['user']> => {
    const { data } = await api.get<ApiResponse<AuthTokens['user']>>('/auth/me');
    return unwrap(data);
  },
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadApi = {
  uploadFile: async (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const config: AxiosRequestConfig = {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    };

    const { data } = await api.post<ApiResponse<UploadResult>>('/upload/file', formData, config);
    return unwrap(data);
  },

  uploadYouTube: async (youtubeUrl: string): Promise<UploadResult> => {
    const { data } = await api.post<ApiResponse<UploadResult>>('/upload/youtube', { youtubeUrl });
    return unwrap(data);
  },

  uploadWebsite: async (websiteUrl: string): Promise<UploadResult> => {
    const { data } = await api.post<ApiResponse<UploadResult>>('/upload/website', { websiteUrl });
    return unwrap(data);
  },
};

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentApi = {
  list: async (page = 1, limit = 20): Promise<{ documents: DocumentSummary[]; total: number; totalPages: number }> => {
    const { data } = await api.get<ApiResponse<DocumentSummary[]>>('/document', {
      params: { page, limit },
    });
    return {
      documents: data.data || [],
      total: data.total || 0,
      totalPages: data.totalPages || 1,
    };
  },

  get: async (id: string): Promise<Document> => {
    const { data } = await api.get<ApiResponse<Document>>(`/document/${id}`);
    return unwrap(data);
  },

  update: async (
    id: string,
    payload: { cleanedText?: string; structuredContent?: Document['structuredContent'] }
  ): Promise<Partial<Document>> => {
    const { data } = await api.patch<ApiResponse<Partial<Document>>>(`/document/${id}`, payload);
    return unwrap(data);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/document/${id}`);
  },

  structure: async (id: string): Promise<Document['structuredContent']> => {
    const { data } = await api.post<ApiResponse<Document['structuredContent']>>(`/document/${id}/structure`);
    return unwrap(data);
  },
};

// ─── Analysis ─────────────────────────────────────────────────────────────────

export const analysisApi = {
  analyze: async (documentId: string, force = false): Promise<AnalysisResult> => {
    const { data } = await api.post<ApiResponse<AnalysisResult>>(
      `/analyze/${documentId}${force ? '?force=1' : ''}`
    );
    return unwrap(data);
  },
};

// ─── Audio ───────────────────────────────────────────────────────────────────

export const audioApi = {
  generate: async (
    documentId: string,
    provider: 'elevenlabs' | 'google' = 'elevenlabs'
  ): Promise<{ totalSegments: number; segments: AudioSegment[] }> => {
    const { data } = await api.post<ApiResponse<{ totalSegments: number; segments: AudioSegment[] }>>(
      '/generate-audio',
      { documentId, provider }
    );
    return unwrap(data);
  },

  getSegments: async (documentId: string): Promise<AudioSegment[]> => {
    const { data } = await api.get<ApiResponse<AudioSegment[]>>(`/generate-audio/${documentId}`);
    return unwrap(data);
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const exportApi = {
  ppt: async (
    documentId: string,
    options: { title?: string; theme?: 'light' | 'dark' | 'professional'; includeNotes?: boolean }
  ): Promise<Blob> => {
    const response = await api.post('/export/ppt', { documentId, ...options }, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  pdf: async (
    documentId: string,
    options: { title?: string }
  ): Promise<Blob> => {
    const response = await api.post('/export/pdf', { documentId, ...options }, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  docx: async (
    documentId: string,
    options: { title?: string }
  ): Promise<Blob> => {
    const response = await api.post('/export/docx', { documentId, ...options }, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};

// ─── User ─────────────────────────────────────────────────────────────────────

export const userApi = {
  getUsage: async (): Promise<UsageStats> => {
    const { data } = await api.get<ApiResponse<UsageStats>>('/user/usage');
    return unwrap(data);
  },

  deleteAccount: async (): Promise<{ documentsDeleted: number }> => {
    const { data } = await api.delete<ApiResponse<{ documentsDeleted: number }>>('/user');
    return unwrap(data);
  },
};

export default api;
