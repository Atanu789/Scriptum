import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  ApiResponse,
  AdminAuditLogItem,
  AdminAuthResult,
  AdminMetrics,
  AdminOverview,
  AdminRevenue,
  AdminUserSummary,
  AuthTokens,
  Document,
  DocumentSummary,
  UploadResult,
  AnalysisResult,
  DocumentHumanizeJobStart,
  DocumentHumanizeJobStatus,
  HumanizeResult,
  AudioSegment,
  UsageStats,
  SubscriptionInfo,
  PaymentRecord,
  PlanConfig,
  BillingCycle,
  AdminPricingPlanConfig,
  DiscountRequestItem,
  HumanizerPlans,
  HumanizerProcessResult,
  HumanizerHistoryRecord,
  HumanizerUiMode,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

type AuthTokenProvider = () => Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider;
}

function normalizeAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/uploads/')) return `${BASE_URL}${url}`;
  if (url.startsWith('uploads/')) return `${BASE_URL}/${url}`;
  return url;
}

function normalizeHtmlAssetUrls(html?: string | null): string {
  if (!html) return '';
  return html.replace(/\b(src|href|poster)=(['"])([^'"]+)\2/gi, (match, attr, quote, value) => {
    const normalized = normalizeAssetUrl(value);
    return normalized ? `${attr}=${quote}${normalized}${quote}` : match;
  });
}

function normalizeDocument(doc: Document): Document {
  return {
    ...doc,
    mediaUrl: normalizeAssetUrl(doc.mediaUrl),
    cleanedText: normalizeHtmlAssetUrls(doc.cleanedText),
    editorHtml: normalizeHtmlAssetUrls(doc.editorHtml),
    presentationContent: doc.presentationContent
      ? {
          ...doc.presentationContent,
          slides: doc.presentationContent.slides.map((slide) => ({
            ...slide,
            media: slide.media.map((media) => ({
              ...media,
              url: normalizeAssetUrl(media.url),
            })),
          })),
        }
      : doc.presentationContent,
  };
}

// ─── Axios instance ───────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// Attach auth token (Clerk first, localStorage fallback for legacy flows)
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const headers = config.headers as Record<string, string | undefined> | undefined;
  const hasAuthorization = Boolean(headers?.Authorization || headers?.authorization);

  if (hasAuthorization) {
    return config;
  }

  let token: string | null = null;

  if (authTokenProvider) {
    try {
      token = await authTokenProvider();
    } catch {
      token = null;
    }
  }

  if (!token && typeof window !== 'undefined') {
    token = localStorage.getItem('ultimoversio_token');
  }

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  return config;
});

// Handle 401 globally — but NOT on auth endpoints (those 401s carry the real error message)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || '';
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/google') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/reset-password');
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

  google: async (payload: { idToken: string }): Promise<AuthTokens> => {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/auth/google', payload);
    return unwrap(data);
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post('/auth/forgot-password', { email });
  },

  resetPassword: async (token: string, password: string): Promise<void> => {
    await api.post('/auth/reset-password', { token, password });
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
      documents: (data.data || []).map((doc) => normalizeDocument(doc as Document) as DocumentSummary),
      total: data.total || 0,
      totalPages: data.totalPages || 1,
    };
  },

  get: async (id: string): Promise<Document> => {
    const { data } = await api.get<ApiResponse<Document>>(`/document/${id}`);
    return normalizeDocument(unwrap(data));
  },

  update: async (
    id: string,
    payload: {
      cleanedText?: string;
      editorHtml?: string;
      structuredContent?: Document['structuredContent'];
      fixedGrammarIssueKeys?: string[];
    }
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

  humanizeStart: async (
    documentId: string,
    options?: { mode?: 'conservative' | 'balanced' | 'aggressive'; styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic' }
  ): Promise<DocumentHumanizeJobStart> => {
    const { data } = await api.post<ApiResponse<DocumentHumanizeJobStart>>(`/analyze/${documentId}/humanize`, options || {});
    return unwrap(data);
  },

  humanizeStatus: async (documentId: string, jobId: string): Promise<DocumentHumanizeJobStatus> => {
    const { data } = await api.get<ApiResponse<DocumentHumanizeJobStatus>>(`/analyze/${documentId}/humanize/${jobId}`);
    return unwrap(data);
  },

  humanize: async (
    documentId: string,
    options?: { mode?: 'conservative' | 'balanced' | 'aggressive'; styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic' }
  ): Promise<HumanizeResult> => {
    const started = await analysisApi.humanizeStart(documentId, options);
    const maxAttempts = 600;

    for (let i = 0; i < maxAttempts; i += 1) {
      const status = await analysisApi.humanizeStatus(documentId, started.jobId);
      if (status.status === 'done' && status.result) return status.result;
      if (status.status === 'failed') {
        throw new Error(status.error || 'Humanization failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Humanization job timed out');
  },
};

export const humanizerApi = {
  getPlans: async (): Promise<HumanizerPlans> => {
    const { data } = await api.get<ApiResponse<HumanizerPlans>>('/humanizer/plans');
    return unwrap(data);
  },

  process: async (payload: { text: string; mode: HumanizerUiMode }): Promise<HumanizerProcessResult> => {
    const submit = await api.post('/humanizer/process', payload);
    const submitBody = submit.data as ApiResponse<unknown> & {
      jobId?: string;
      status?: string;
      data?: unknown;
    };

    const submitData = (submitBody?.data ?? submitBody) as {
      jobId?: string;
      status?: 'processing' | 'done' | 'failed';
      result?: HumanizerProcessResult;
      humanizedText?: string;
    };

    // Backward compatibility: some server versions return immediate result.
    if (submitData?.humanizedText) {
      return submitData as HumanizerProcessResult;
    }

    if (submitData?.result?.humanizedText) {
      return submitData.result;
    }

    const jobId = submitData?.jobId || submitBody?.jobId;
    if (!jobId) {
      throw new Error('Humanizer did not return a job id or result');
    }

    const maxAttempts = 90;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const poll = await api.get(`/humanizer/process/${jobId}`);
      const pollBody = poll.data as ApiResponse<unknown> & {
        status?: string;
        result?: HumanizerProcessResult | null;
        error?: string;
        data?: unknown;
      };

      const state = (pollBody?.data ?? pollBody) as {
        jobId?: string;
        status?: 'processing' | 'done' | 'failed';
        result?: HumanizerProcessResult | null;
        error?: string;
        humanizedText?: string;
      };

      // Backward compatibility: endpoint may return direct result payload.
      if (state?.humanizedText) {
        return state as HumanizerProcessResult;
      }

      if (state.status === 'done' && state.result) {
        return state.result;
      }

      if (state.status === 'failed') {
        if (state.result) return state.result;
        throw new Error(state.error || 'Humanizer job failed');
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Humanizer job timed out while waiting for completion.');
  },

  listHistory: async (limit = 20): Promise<HumanizerHistoryRecord[]> => {
    const { data } = await api.get<ApiResponse<HumanizerHistoryRecord[]>>('/humanizer/history', { params: { limit } });
    return unwrap(data);
  },

  save: async (payload: { originalText: string; humanizedText: string; mode: HumanizerUiMode }): Promise<HumanizerHistoryRecord> => {
    const { data } = await api.post<ApiResponse<HumanizerHistoryRecord>>('/humanizer/save', payload);
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

export const supportApi = {
  reportBug: async (payload: { description: string; page: string; screenshot?: string }): Promise<void> => {
    await api.post('/report-bug', payload);
  },
};

// ─── Payment ────────────────────────────────────────────────────────────────────────

export const paymentApi = {
  getPlans: async (): Promise<Record<string, PlanConfig>> => {
    const { data } = await api.get<ApiResponse<Record<string, PlanConfig>>>('/payment/plans');
    return unwrap(data);
  },

  getSubscription: async (): Promise<SubscriptionInfo> => {
    const { data } = await api.get<ApiResponse<SubscriptionInfo>>('/payment/subscription');
    return unwrap(data);
  },

  getHistory: async (): Promise<PaymentRecord[]> => {
    const { data } = await api.get<ApiResponse<PaymentRecord[]>>('/payment/history');
    return unwrap(data);
  },

  createOrder: async (plan: string, billingCycle: BillingCycle, discountCode?: string): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    originalAmount?: number;
    discountPaise?: number;
    discountPercent?: number;
    billingCycle: BillingCycle;
  }> => {
    const { data } = await api.post<ApiResponse<{
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      originalAmount?: number;
      discountPaise?: number;
      discountPercent?: number;
      billingCycle: BillingCycle;
    }>>('/payment/create-order', { plan, billingCycle, discountCode });
    return unwrap(data);
  },

  verify: async (payload: {
    razorpay_order_id:   string;
    razorpay_payment_id: string;
    razorpay_signature:  string;
  }): Promise<{ plan: string; planExpiryDate: string; message: string }> => {
    const { data } = await api.post<ApiResponse<{ plan: string; planExpiryDate: string; message: string }>>('/payment/verify', payload);
    return unwrap(data);
  },

  redeem: async (code: string): Promise<{ plan: string; planExpiryDate: string; message: string }> => {
    const { data } = await api.post<ApiResponse<{ plan: string; planExpiryDate: string; message: string }>>('/payment/redeem', { code });
    return unwrap(data);
  },

  requestDiscount: async (payload: {
    email: string;
    reason: string;
    requestedPlan: 'pro' | 'advanced';
  }): Promise<{ email: string; requestedPlan: 'pro' | 'advanced'; status: 'pending' }> => {
    const { data } = await api.post<ApiResponse<{ email: string; requestedPlan: 'pro' | 'advanced'; status: 'pending' }>>('/payment/discount-request', payload);
    return unwrap(data);
  },
};

// ─── Admin ───────────────────────────────────────────────────────────────────

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
  adminToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(`${BASE_URL}/api/admin${path}`, {
    ...init,
    headers,
  });

  const data = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Admin request failed');
  }

  return data.data as T;
}

export const adminApi = {
  login: async (payload: { username: string; password: string }): Promise<AdminAuthResult> => {
    return adminRequest<AdminAuthResult>('/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  overview: async (token: string): Promise<AdminOverview> => {
    return adminRequest<AdminOverview>('/overview', { method: 'GET' }, token);
  },

  metrics: async (token: string): Promise<AdminMetrics> => {
    return adminRequest<AdminMetrics>('/metrics', { method: 'GET' }, token);
  },

  revenue: async (token: string): Promise<AdminRevenue> => {
    return adminRequest<AdminRevenue>('/revenue', { method: 'GET' }, token);
  },

  listUsers: async (
    token: string,
    params?: { q?: string; page?: number; limit?: number },
  ): Promise<{ users: AdminUserSummary[]; total: number; page: number; limit: number; totalPages: number }> => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));

    const rawResponse = await fetch(`${BASE_URL}/api/admin/users${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await rawResponse.json()) as ApiResponse<AdminUserSummary[]> & {
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
    };

    if (!rawResponse.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch admin users');
    }

    return {
      users: (json.data || []).map((user) => ({
        ...user,
        plan: user.plan === 'pro' ? 'pro' : 'free',
        planStartDate: user.planStartDate ?? null,
        planExpiryDate: user.planExpiryDate ?? null,
        aiUsageThisMonth: Number(user.aiUsageThisMonth || 0),
        uploadUsageThisMonth: Number(user.uploadUsageThisMonth || 0),
        aiUsageLimitOverride:
          typeof user.aiUsageLimitOverride === 'number' ? user.aiUsageLimitOverride : null,
        uploadUsageLimitOverride:
          typeof user.uploadUsageLimitOverride === 'number' ? user.uploadUsageLimitOverride : null,
        trialTtsNarrationUsed: Boolean(user.trialTtsNarrationUsed),
        documentCount: Number(user.documentCount || 0),
        totalAnalyses: Number(user.totalAnalyses || 0),
        totalGeminiCalls: Number(user.totalGeminiCalls || 0),
        lastActiveAt: user.lastActiveAt ?? null,
        status: user.status === 'active' ? 'active' : 'inactive',
      })),
      total: json.total || 0,
      page: json.page || 1,
      limit: json.limit || 25,
      totalPages: json.totalPages || 1,
    };
  },

  updateUser: async (
    token: string,
    userId: string,
    payload: {
      plan?: 'free' | 'pro';
      planDays?: number;
      aiUsageLimitOverride?: number | null;
      uploadUsageLimitOverride?: number | null;
      trialTtsNarrationUsed?: boolean;
      resetUsage?: boolean;
      reason?: string;
    },
  ): Promise<AdminUserSummary> => {
    return adminRequest<AdminUserSummary>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, token);
  },

  deleteUser: async (
    token: string,
    userId: string,
    reason?: string,
  ): Promise<{ userId: string; documentsDeleted: number; paymentsDeleted: number; usagesDeleted: number }> => {
    return adminRequest<{ userId: string; documentsDeleted: number; paymentsDeleted: number; usagesDeleted: number }>(`/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: reason || undefined }),
    }, token);
  },

  auditLogs: async (
    token: string,
    params?: { q?: string; action?: string; page?: number; limit?: number },
  ): Promise<{ logs: AdminAuditLogItem[]; page: number; limit: number; total: number; totalPages: number }> => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.action) qs.set('action', params.action);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));

    const rawResponse = await fetch(`${BASE_URL}/api/admin/audit-logs${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = (await rawResponse.json()) as ApiResponse<AdminAuditLogItem[]> & {
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
    };

    if (!rawResponse.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch admin audit logs');
    }

    return {
      logs: json.data || [],
      page: json.page || 1,
      limit: json.limit || 20,
      total: json.total || 0,
      totalPages: json.totalPages || 1,
    };
  },

  getPricing: async (token: string): Promise<AdminPricingPlanConfig[]> => {
    return adminRequest<AdminPricingPlanConfig[]>('/pricing', { method: 'GET' }, token);
  },

  updatePricing: async (
    token: string,
    planId: 'pro' | 'advanced',
    payload: Partial<Pick<AdminPricingPlanConfig, 'displayName' | 'monthlyPriceINR' | 'yearlyPriceINR' | 'enabled' | 'discountPercent'>> & { reason?: string },
  ): Promise<AdminPricingPlanConfig> => {
    return adminRequest<AdminPricingPlanConfig>(`/pricing/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, token);
  },

  listDiscountRequests: async (
    token: string,
    params?: { status?: 'all' | 'pending' | 'approved' | 'rejected'; q?: string; page?: number; limit?: number },
  ): Promise<{ requests: DiscountRequestItem[]; total: number; page: number; limit: number; totalPages: number }> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));

    const rawResponse = await fetch(`${BASE_URL}/api/admin/discount-requests${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = (await rawResponse.json()) as ApiResponse<DiscountRequestItem[]> & {
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
    };

    if (!rawResponse.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch discount requests');
    }

    return {
      requests: json.data || [],
      total: json.total || 0,
      page: json.page || 1,
      limit: json.limit || 20,
      totalPages: json.totalPages || 1,
    };
  },

  updateDiscountRequest: async (
    token: string,
    requestId: string,
    payload: {
      status?: 'pending' | 'approved' | 'rejected';
      offeredDiscountPercent?: number | null;
      assignedPlan?: 'free' | 'pro' | 'advanced' | null;
      assignToUser?: boolean;
      planDays?: number;
      adminNotes?: string | null;
      reason?: string;
    },
  ): Promise<DiscountRequestItem> => {
    return adminRequest<DiscountRequestItem>(`/discount-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, token);
  },
};

export default api;
