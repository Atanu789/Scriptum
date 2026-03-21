'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Crown,
  DollarSign,
  FileText,
  Loader2,
  LogOut,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import type {
  AdminAuditLogItem,
  AdminMetrics,
  AdminPricingPlanConfig,
  AdminRevenue,
  AdminUserSummary,
  DiscountRequestItem,
} from '@/types';

type SectionKey = 'dashboard' | 'users' | 'revenue' | 'logs' | 'settings';

const ADMIN_TOKEN_KEY = 'ultimoversio_admin_token';
const ADMIN_USERNAME_KEY = 'ultimoversio_admin_username';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function TrendPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        positive
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
      }`}
    >
      {positive ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

export default function AdminPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminName, setAdminName] = useState('admin');
  const [token, setToken] = useState<string | null>(null);

  const [section, setSection] = useState<SectionKey>('dashboard');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [pricingConfigs, setPricingConfigs] = useState<AdminPricingPlanConfig[]>([]);
  const [pricingSavingPlanId, setPricingSavingPlanId] = useState<string | null>(null);

  const [discountRequests, setDiscountRequests] = useState<DiscountRequestItem[]>([]);
  const [discountRequestsLoading, setDiscountRequestsLoading] = useState(false);
  const [discountRequestsPage, setDiscountRequestsPage] = useState(1);
  const [discountRequestsTotalPages, setDiscountRequestsTotalPages] = useState(1);
  const [discountRequestsStatusFilter, setDiscountRequestsStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [discountActionBusyId, setDiscountActionBusyId] = useState<string | null>(null);
  const [discountDraft, setDiscountDraft] = useState<Record<string, {
    percent: string;
    plan: 'free' | 'pro' | 'advanced';
    notes: string;
    assignToUser: boolean;
  }>>({});

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);

  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsActionFilter, setLogsActionFilter] = useState('all');

  const [rowQuotaDraft, setRowQuotaDraft] = useState<Record<string, { ai: string; upload: string }>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Confirm Action');
  const [confirmBody, setConfirmBody] = useState('Are you sure?');
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<((reason?: string) => Promise<void>) | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(ADMIN_TOKEN_KEY);
    const existingName = localStorage.getItem(ADMIN_USERNAME_KEY);
    if (existing) setToken(existing);
    if (existingName) setAdminName(existingName);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadMetrics = useCallback(async (currentToken: string) => {
    const nextMetrics = await adminApi.metrics(currentToken);
    setMetrics(nextMetrics);
  }, []);

  const loadRevenue = useCallback(async (currentToken: string) => {
    const nextRevenue = await adminApi.revenue(currentToken);
    setRevenue(nextRevenue);
  }, []);

  const loadPricingConfigs = useCallback(async (currentToken: string) => {
    const configs = await adminApi.getPricing(currentToken);
    setPricingConfigs(configs);
  }, []);

  const loadDiscountRequests = useCallback(async (
    currentToken: string,
    page = discountRequestsPage,
    q = searchTerm,
    status = discountRequestsStatusFilter,
  ) => {
    setDiscountRequestsLoading(true);
    try {
      const result = await adminApi.listDiscountRequests(currentToken, {
        page,
        limit: 12,
        q,
        status,
      });
      setDiscountRequests(result.requests);
      setDiscountDraft((prev) => {
        const next = { ...prev };
        for (const item of result.requests) {
          if (!next[item._id]) {
            next[item._id] = {
              percent: item.offeredDiscountPercent == null ? '' : String(item.offeredDiscountPercent),
              plan: item.assignedPlan || (item.requestedPlan === 'advanced' ? 'advanced' : 'pro'),
              notes: item.adminNotes || '',
              assignToUser: false,
            };
          }
        }
        return next;
      });
      setDiscountRequestsPage(result.page);
      setDiscountRequestsTotalPages(result.totalPages);
    } finally {
      setDiscountRequestsLoading(false);
    }
  }, [discountRequestsPage, discountRequestsStatusFilter, searchTerm]);

  const loadUsers = useCallback(async (currentToken: string, page = usersPage, q = searchTerm) => {
    setUsersLoading(true);
    try {
      const result = await adminApi.listUsers(currentToken, { page, limit: 15, q });
      setUsers(result.users);
      setUsersPage(result.page);
      setUsersTotalPages(result.totalPages);
      setUsersTotal(result.total);
      setRowQuotaDraft((prev) => {
        const next = { ...prev };
        for (const user of result.users) {
          if (!next[user.id]) {
            next[user.id] = {
              ai: user.aiUsageLimitOverride === null ? '' : String(user.aiUsageLimitOverride),
              upload: user.uploadUsageLimitOverride === null ? '' : String(user.uploadUsageLimitOverride),
            };
          }
        }
        return next;
      });
    } finally {
      setUsersLoading(false);
    }
  }, [searchTerm, usersPage]);

  const loadLogs = useCallback(async (currentToken: string, page = logsPage, q = searchTerm, action = logsActionFilter) => {
    setLogsLoading(true);
    try {
      const result = await adminApi.auditLogs(currentToken, {
        page,
        limit: 12,
        q,
        action,
      });
      setLogs(result.logs);
      setLogsPage(result.page);
      setLogsTotalPages(result.totalPages);
    } finally {
      setLogsLoading(false);
    }
  }, [logsActionFilter, logsPage, searchTerm]);

  const bootstrap = useCallback(async (currentToken: string) => {
    setIsBootstrapping(true);
    try {
      await Promise.all([
        loadMetrics(currentToken),
        loadUsers(currentToken, 1, ''),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load admin panel';
      toast.error(message);
      if (message.toLowerCase().includes('token') || message.toLowerCase().includes('admin')) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_USERNAME_KEY);
        setToken(null);
      }
    } finally {
      setIsBootstrapping(false);
    }
  }, [loadMetrics, loadUsers]);

  useEffect(() => {
    if (!token) return;
    void bootstrap(token);
  }, [token, bootstrap]);

  useEffect(() => {
    if (!token) return;

    if (section === 'users') {
      void loadUsers(token, usersPage, searchTerm);
    }

    if (section === 'logs') {
      void loadLogs(token, logsPage, searchTerm, logsActionFilter);
    }

    if (section === 'revenue' && !revenue) {
      void loadRevenue(token).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load revenue');
      });
    }

    if (section === 'settings') {
      void loadPricingConfigs(token).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load pricing config');
      });
      void loadDiscountRequests(token, discountRequestsPage, searchTerm, discountRequestsStatusFilter).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load discount requests');
      });
    }
  }, [token, section, searchTerm, usersPage, logsPage, logsActionFilter, revenue, loadUsers, loadLogs, loadRevenue, loadPricingConfigs, loadDiscountRequests, discountRequestsPage, discountRequestsStatusFilter]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBootstrapping(true);
    try {
      const result = await adminApi.login({ username, password });
      localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      localStorage.setItem(ADMIN_USERNAME_KEY, result.username);
      setAdminName(result.username);
      setToken(result.token);
      setSection('dashboard');
      setSearchInput('');
      setSearchTerm('');
      toast.success('Welcome to admin dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USERNAME_KEY);
    setToken(null);
    setUsers([]);
    setLogs([]);
    setRevenue(null);
    setMetrics(null);
  };

  const openConfirm = (
    title: string,
    body: string,
    action: (reason?: string) => Promise<void>,
  ) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmReason('');
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction(confirmReason.trim() || undefined);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setConfirmBusy(false);
    }
  };

  const patchUser = async (userId: string, payload: Parameters<typeof adminApi.updateUser>[2]) => {
    if (!token) return;
    await adminApi.updateUser(token, userId, payload);
    await Promise.all([
      loadUsers(token, usersPage, searchTerm),
      loadMetrics(token),
    ]);
    if (section === 'logs') {
      await loadLogs(token, 1, searchTerm, logsActionFilter);
    }
  };

  const deleteUser = async (userId: string, reason?: string) => {
    if (!token) return;
    await adminApi.deleteUser(token, userId, reason);
    await Promise.all([
      loadUsers(token, usersPage, searchTerm),
      loadMetrics(token),
    ]);
    if (section === 'logs') {
      await loadLogs(token, 1, searchTerm, logsActionFilter);
    }
  };

  const savePricingPlan = async (plan: AdminPricingPlanConfig) => {
    if (!token) return;
    setPricingSavingPlanId(plan.planId);
    try {
      await adminApi.updatePricing(token, plan.planId, {
        displayName: plan.displayName,
        monthlyPriceINR: plan.monthlyPriceINR,
        yearlyPriceINR: plan.yearlyPriceINR,
        enabled: plan.enabled,
        discountPercent: plan.discountPercent,
      });
      await Promise.all([loadPricingConfigs(token), loadRevenue(token), loadMetrics(token)]);
      toast.success(`${plan.displayName} pricing updated`);
    } finally {
      setPricingSavingPlanId(null);
    }
  };

  const moderateDiscountRequest = async (
    requestId: string,
    payload: {
      status?: 'pending' | 'approved' | 'rejected';
      offeredDiscountPercent?: number | null;
      assignedPlan?: 'free' | 'pro' | 'advanced' | null;
      assignToUser?: boolean;
      planDays?: number;
      adminNotes?: string | null;
      reason?: string;
    }
  ) => {
    if (!token) return;
    setDiscountActionBusyId(requestId);
    try {
      await adminApi.updateDiscountRequest(token, requestId, payload);
      await Promise.all([
        loadDiscountRequests(token, discountRequestsPage, searchTerm, discountRequestsStatusFilter),
        loadUsers(token, usersPage, searchTerm),
        loadMetrics(token),
      ]);
      toast.success('Discount request updated');
    } finally {
      setDiscountActionBusyId(null);
    }
  };

  const dashboardCards = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        label: 'Total Users',
        value: formatCompact(metrics.totalUsers),
        icon: Users,
        trend: metrics.trends.userGrowth30dPct,
      },
      {
        label: 'Active Users (7d)',
        value: formatCompact(metrics.activeUsersLast7Days),
        icon: Activity,
        trend: metrics.trends.activeSharePct,
      },
      {
        label: 'Premium Users',
        value: formatCompact(metrics.proUsers),
        icon: Crown,
        trend: metrics.trends.proSharePct,
      },
      {
        label: 'Active Subscriptions',
        value: formatCompact(metrics.activeSubscriptions),
        icon: Crown,
        trend: metrics.trends.proSharePct,
      },
      {
        label: 'Total Revenue',
        value: formatCurrency(metrics.totalRevenueINR),
        icon: DollarSign,
        trend: metrics.trends.revenueGrowth30dPct,
      },
      {
        label: 'Monthly Revenue',
        value: formatCurrency(metrics.monthlyRevenueINR),
        icon: BarChart3,
        trend: metrics.trends.revenueGrowth30dPct,
      },
      {
        label: 'Total Documents',
        value: formatCompact(metrics.totalDocuments),
        icon: FileText,
        trend: 0,
      },
      {
        label: 'Total AI Analyses',
        value: formatCompact(metrics.totalAnalyses),
        icon: Activity,
        trend: 0,
      },
    ];
  }, [metrics]);

  const sidebarItems: Array<{ key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'revenue', label: 'Revenue', icon: DollarSign },
    { key: 'logs', label: 'Activity Logs', icon: Activity },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const switchSection = useCallback((nextSection: SectionKey) => {
    setSection(nextSection);
    if (nextSection === 'users') setUsersPage(1);
    if (nextSection === 'logs') setLogsPage(1);
    if (nextSection !== 'users' && nextSection !== 'logs') {
      setSearchInput('');
      setSearchTerm('');
    }
  }, []);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
        <form onSubmit={handleLogin} className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            <h1 className="text-lg font-semibold">Admin Login</h1>
          </div>
          <p className="text-sm text-slate-500">Enter admin credentials to continue.</p>

          <div>
            <label className="mb-1 block text-sm">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/20 dark:bg-black/20"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/20 dark:bg-black/20"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isBootstrapping}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isBootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white dark:from-[#05050b] dark:via-[#0b0b14] dark:to-[#121223]">
      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur md:block dark:border-white/10 dark:bg-[#0b0b18]/80">
          <div className="mb-4 px-2 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin Console</p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{adminName}</p>
          </div>

          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => switchSection(item.key)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur md:hidden dark:border-white/10 dark:bg-[#0b0b18]/80">
            <label htmlFor="admin-mobile-section" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Section
            </label>
            <select
              id="admin-mobile-section"
              value={section}
              onChange={(e) => switchSection(e.target.value as SectionKey)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-white/20 dark:bg-black/20"
            >
              {sidebarItems.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b0b18]/80">
            <div className="flex min-w-[250px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (section === 'users') setUsersPage(1);
                  if (section === 'logs') setLogsPage(1);
                }}
                placeholder={
                  section === 'users'
                    ? 'Search users by name or email'
                    : section === 'logs'
                    ? 'Search logs by admin, user, or reason'
                    : 'Search'
                }
                className="w-full bg-transparent text-sm outline-none"
                disabled={section !== 'users' && section !== 'logs'}
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setSearchTerm('');
                  }}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
                {adminName}
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </div>

          {section === 'dashboard' && (
            <section className="space-y-4">
              {isBootstrapping || !metrics ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-white/10 dark:bg-[#0b0b18]/80">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {dashboardCards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                              <div className="mt-2">{card.trend !== 0 ? <TrendPill value={card.trend} /> : null}</div>
                            </div>
                            <Icon className="h-7 w-7 text-indigo-500/70" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b0b18]/80">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <h2 className="text-base font-semibold">User Management</h2>
                <p className="text-xs text-slate-500">Safe actions with confirmation modals and optional reason logs.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-[#111327]">
                    <tr>
                      <th className="px-3 py-3">User</th>
                      <th className="px-3 py-3">Plan</th>
                      <th className="px-3 py-3">Usage</th>
                      <th className="px-3 py-3">Documents</th>
                      <th className="px-3 py-3">Last Active</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading users...</span>
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No users found.</td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id} className="border-b border-slate-100 align-top dark:border-white/5">
                          <td className="px-3 py-3">
                            <p className="font-semibold">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${u.plan === 'pro' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'}`}>
                              {u.plan.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <p>AI: <span className="font-semibold">{u.aiUsageThisMonth}</span></p>
                            <p>Uploads: <span className="font-semibold">{u.uploadUsageThisMonth}</span></p>
                          </td>
                          <td className="px-3 py-3 font-semibold">{u.documentCount}</td>
                          <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : 'N/A'}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                              {u.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => openConfirm(
                                    u.plan === 'pro' ? 'Downgrade Plan' : 'Upgrade Plan',
                                    `Are you sure you want to ${u.plan === 'pro' ? 'downgrade' : 'upgrade'} ${u.email}?`,
                                    async (reason) => {
                                      await patchUser(u.id, {
                                        plan: u.plan === 'pro' ? 'free' : 'pro',
                                        planDays: u.plan === 'pro' ? undefined : 30,
                                        reason,
                                      });
                                      toast.success('Plan updated');
                                    }
                                  )}
                                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-white/20 dark:hover:bg-white/10"
                                >
                                  {u.plan === 'pro' ? 'Downgrade' : 'Upgrade'}
                                </button>

                                <button
                                  onClick={() => openConfirm(
                                    'Reset Usage Counters',
                                    `Reset usage counters for ${u.email}?`,
                                    async (reason) => {
                                      await patchUser(u.id, { resetUsage: true, reason });
                                      toast.success('Usage reset');
                                    }
                                  )}
                                  className="rounded-lg border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                >
                                  Reset Usage
                                </button>

                                <button
                                  onClick={() => openConfirm(
                                    'Delete User',
                                    `This action cannot be undone. Delete ${u.email}?`,
                                    async (reason) => {
                                      await deleteUser(u.id, reason);
                                      toast.success('User deleted');
                                    }
                                  )}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-300 dark:hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={rowQuotaDraft[u.id]?.ai ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setRowQuotaDraft((prev) => ({
                                      ...prev,
                                      [u.id]: {
                                        ai: value,
                                        upload: prev[u.id]?.upload ?? '',
                                      },
                                    }));
                                  }}
                                  placeholder="AI limit"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                                />
                                <input
                                  value={rowQuotaDraft[u.id]?.upload ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setRowQuotaDraft((prev) => ({
                                      ...prev,
                                      [u.id]: {
                                        ai: prev[u.id]?.ai ?? '',
                                        upload: value,
                                      },
                                    }));
                                  }}
                                  placeholder="Upload limit"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                                />
                              </div>

                              <button
                                onClick={() => openConfirm(
                                  'Update Quotas',
                                  `Apply quota overrides for ${u.email}? Leave fields blank for plan defaults.`,
                                  async (reason) => {
                                    const aiRaw = (rowQuotaDraft[u.id]?.ai || '').trim();
                                    const uploadRaw = (rowQuotaDraft[u.id]?.upload || '').trim();
                                    await patchUser(u.id, {
                                      aiUsageLimitOverride: aiRaw === '' ? null : Number(aiRaw),
                                      uploadUsageLimitOverride: uploadRaw === '' ? null : Number(uploadRaw),
                                      reason,
                                    });
                                    toast.success('Quota updated');
                                  }
                                )}
                                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                              >
                                Save Quotas
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs dark:border-white/10">
                <p className="text-slate-500">{usersTotal} users • page {usersPage} of {usersTotalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    disabled={usersPage <= 1 || usersLoading}
                    className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                    disabled={usersPage >= usersTotalPages || usersLoading}
                    className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}

          {section === 'revenue' && (
            <section className="space-y-4">
              {!revenue ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-white/10 dark:bg-[#0b0b18]/80">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Total Revenue</p>
                      <p className="mt-2 text-2xl font-bold">{formatCurrency(revenue.totalRevenueINR)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Monthly Revenue</p>
                      <p className="mt-2 text-2xl font-bold">{formatCurrency(revenue.monthlyRevenueINR)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Revenue Per User</p>
                      <p className="mt-2 text-2xl font-bold">{formatCurrency(revenue.revenuePerUserINR)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Active Subscriptions</p>
                      <p className="mt-2 text-2xl font-bold">{revenue.activeSubscriptions}</p>
                      <p className="text-xs text-slate-500">Free {revenue.subscriptionDistribution.free} / Pro {revenue.subscriptionDistribution.pro}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                    <h3 className="mb-4 font-semibold">Monthly Revenue</h3>
                    <div className="grid grid-cols-12 gap-2">
                      {revenue.monthlyRevenue.map((point) => {
                        const max = Math.max(...revenue.monthlyRevenue.map((p) => p.revenueINR), 1);
                        const heightPct = Math.max(8, Math.round((point.revenueINR / max) * 100));
                        return (
                          <div key={point.key} className="flex flex-col items-center gap-2">
                            <div className="flex h-36 w-full items-end rounded-md bg-slate-100 p-1 dark:bg-white/5">
                              <div className="w-full rounded-sm bg-indigo-500" style={{ height: `${heightPct}%` }} />
                            </div>
                            <p className="text-[11px] text-slate-500">{point.label}</p>
                            <p className="text-[10px] text-slate-400">{formatCompact(point.revenueINR)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {section === 'logs' && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b0b18]/80">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div>
                  <h2 className="text-base font-semibold">Activity Logs</h2>
                  <p className="text-xs text-slate-500">Search and filter admin actions.</p>
                </div>
                <select
                  value={logsActionFilter}
                  onChange={(e) => {
                    setLogsActionFilter(e.target.value);
                    setLogsPage(1);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-white/20 dark:bg-black/20"
                >
                  <option value="all">All Actions</option>
                  <option value="grant_premium">Grant Premium</option>
                  <option value="revoke_premium">Revoke Premium</option>
                  <option value="reset_usage">Reset Usage</option>
                  <option value="set_ai_limit">Set AI Limit</option>
                  <option value="set_upload_limit">Set Upload Limit</option>
                  <option value="delete_user">Delete User</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-[#111327]">
                    <tr>
                      <th className="px-3 py-3">Admin</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-3 py-3">Target User</th>
                      <th className="px-3 py-3">Reason</th>
                      <th className="px-3 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading logs...</span>
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">No activity found.</td>
                      </tr>
                    ) : (
                      logs.map((log, index) => (
                        <tr key={`${log.timestamp}-${index}`} className="border-b border-slate-100 dark:border-white/5">
                          <td className="px-3 py-3 font-semibold">{log.adminUsername}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-white/10">
                              {log.action.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-3">{log.targetUserEmail}</td>
                          <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">{log.reason}</td>
                          <td className="px-3 py-3 text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 text-xs dark:border-white/10">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage <= 1 || logsLoading}
                  className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                >
                  Previous
                </button>
                <span className="text-slate-500">Page {logsPage} of {logsTotalPages}</span>
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  disabled={logsPage >= logsTotalPages || logsLoading}
                  className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                >
                  Next
                </button>
              </div>
            </section>
          )}

          {section === 'settings' && (
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                <h3 className="text-base font-semibold">Admin Session</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Signed in as {adminName}. JWT role-based auth is active. Dangerous actions require explicit confirmation in the modal.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      if (!token) return;
                      await Promise.all([
                        loadMetrics(token),
                        loadUsers(token, 1, ''),
                        loadRevenue(token),
                        loadPricingConfigs(token),
                        loadDiscountRequests(token, 1, searchTerm, discountRequestsStatusFilter),
                      ]);
                      toast.success('Data refreshed');
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    Refresh All Data
                  </button>
                  <button
                    onClick={logout}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Logout
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                <h3 className="text-base font-semibold">Dynamic Pricing Control</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Update monthly/yearly INR pricing, enable or disable plans, and set default discounts.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {pricingConfigs.map((plan) => (
                    <div key={plan.planId} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-semibold">{plan.displayName}</h4>
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={plan.enabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPricingConfigs((prev) => prev.map((item) => item.planId === plan.planId ? { ...item, enabled: checked } : item));
                            }}
                          />
                          Enabled
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={0}
                          value={plan.monthlyPriceINR}
                          onChange={(e) => {
                            const value = Number(e.target.value || 0);
                            setPricingConfigs((prev) => prev.map((item) => item.planId === plan.planId ? { ...item, monthlyPriceINR: value } : item));
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                          placeholder="Monthly INR"
                        />
                        <input
                          type="number"
                          min={0}
                          value={plan.yearlyPriceINR}
                          onChange={(e) => {
                            const value = Number(e.target.value || 0);
                            setPricingConfigs((prev) => prev.map((item) => item.planId === plan.planId ? { ...item, yearlyPriceINR: value } : item));
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                          placeholder="Yearly INR"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={plan.discountPercent}
                          onChange={(e) => {
                            const value = Number(e.target.value || 0);
                            setPricingConfigs((prev) => prev.map((item) => item.planId === plan.planId ? { ...item, discountPercent: value } : item));
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                          placeholder="Discount %"
                        />
                        <button
                          onClick={() => {
                            void savePricingPlan(plan);
                          }}
                          disabled={pricingSavingPlanId === plan.planId}
                          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                        >
                          {pricingSavingPlanId === plan.planId ? 'Saving...' : 'Save pricing'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1020]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">Concession Requests</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Approve/reject requests and optionally assign plan or custom discount.</p>
                  </div>
                  <select
                    value={discountRequestsStatusFilter}
                    onChange={(e) => {
                      const status = e.target.value as 'all' | 'pending' | 'approved' | 'rejected';
                      setDiscountRequestsStatusFilter(status);
                      setDiscountRequestsPage(1);
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-white/20 dark:bg-black/20"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-[#111327]">
                      <tr>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Requested</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">Offer</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountRequestsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">Loading requests...</td>
                        </tr>
                      ) : discountRequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">No concession requests found.</td>
                        </tr>
                      ) : discountRequests.map((request) => {
                        const draft = discountDraft[request._id] || {
                          percent: '',
                          plan: request.requestedPlan === 'advanced' ? 'advanced' as const : 'pro' as const,
                          notes: '',
                          assignToUser: false,
                        };

                        return (
                          <tr key={request._id} className="border-b border-slate-100 align-top dark:border-white/5">
                            <td className="px-3 py-2">
                              <p className="font-semibold">{request.email}</p>
                              <p className="text-[11px] text-slate-500">{new Date(request.createdAt).toLocaleString()}</p>
                              <p className="text-[11px] text-slate-500">Status: {request.status}</p>
                            </td>
                            <td className="px-3 py-2 text-xs uppercase">{request.requestedPlan}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{request.reason}</td>
                            <td className="px-3 py-2">
                              <div className="grid gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={draft.percent}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setDiscountDraft((prev) => ({
                                      ...prev,
                                      [request._id]: { ...draft, percent: value },
                                    }));
                                  }}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                                  placeholder="Discount %"
                                />
                                <select
                                  value={draft.plan}
                                  onChange={(e) => {
                                    const value = e.target.value as 'free' | 'pro' | 'advanced';
                                    setDiscountDraft((prev) => ({
                                      ...prev,
                                      [request._id]: { ...draft, plan: value },
                                    }));
                                  }}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
                                >
                                  <option value="free">free</option>
                                  <option value="pro">pro</option>
                                  <option value="advanced">advanced</option>
                                </select>
                                <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={draft.assignToUser}
                                    onChange={(e) => {
                                      setDiscountDraft((prev) => ({
                                        ...prev,
                                        [request._id]: { ...draft, assignToUser: e.target.checked },
                                      }));
                                    }}
                                  />
                                  Apply to user account
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => {
                                    void moderateDiscountRequest(request._id, {
                                      status: 'approved',
                                      offeredDiscountPercent: draft.percent.trim() === '' ? null : Number(draft.percent),
                                      assignedPlan: draft.plan,
                                      assignToUser: draft.assignToUser,
                                      adminNotes: draft.notes || null,
                                    });
                                  }}
                                  disabled={discountActionBusyId === request._id}
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    void moderateDiscountRequest(request._id, {
                                      status: 'rejected',
                                      adminNotes: draft.notes || null,
                                    });
                                  }}
                                  disabled={discountActionBusyId === request._id}
                                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                  <button
                    onClick={() => setDiscountRequestsPage((p) => Math.max(1, p - 1))}
                    disabled={discountRequestsPage <= 1 || discountRequestsLoading}
                    className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                  >
                    Previous
                  </button>
                  <span className="text-slate-500">Page {discountRequestsPage} of {discountRequestsTotalPages}</span>
                  <button
                    onClick={() => setDiscountRequestsPage((p) => Math.min(discountRequestsTotalPages, p + 1))}
                    disabled={discountRequestsPage >= discountRequestsTotalPages || discountRequestsLoading}
                    className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-white/20"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#0f1020]">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{confirmTitle}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{confirmBody}</p>
              </div>
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Reason (optional)</label>
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                placeholder="Add context for audit trail"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={confirmBusy}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={runConfirmedAction}
                disabled={confirmBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {confirmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
