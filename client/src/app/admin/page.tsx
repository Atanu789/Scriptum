'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import type { AdminUserSummary } from '@/types';
import { Loader2, Shield, Search, Crown, Ban, RotateCcw, Trash2, LogOut, Users, Activity, FileText, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ADMIN_TOKEN_KEY = 'ultimoversio_admin_token';
const ADMIN_ACTION_KEY = process.env.NEXT_PUBLIC_ADMIN_ACTION_KEY || '';

export default function AdminPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [planFilter, setPlanFilter] = useState<'all' | 'pro' | 'free'>('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (existing) setToken(existing);
  }, []);

  const loadUsers = useCallback(async (search = query, currentToken = token) => {
    if (!currentToken) return;
    setIsLoading(true);
    try {
      const [userResult, overviewResult, auditResult] = await Promise.all([
        adminApi.listUsers(currentToken, { q: search, limit: 100, page: 1 }),
        adminApi.overview(currentToken).catch(() => null),
        adminApi.auditLogs(currentToken).catch(() => []),
      ]);
      setUsers(userResult.users);
      if (overviewResult) setOverview(overviewResult);
      if (auditResult) setAuditLogs(auditResult);
      setLastRefreshedAt(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      toast.error(msg);
      if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('admin')) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    if (!token) return;
    void loadUsers();
  }, [token, loadUsers]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await adminApi.login({ username, password });
      localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      setToken(result.token);
      toast.success('Admin login successful');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setUsers([]);
  };

  const updateUser = async (userId: string, payload: Partial<Parameters<typeof adminApi.updateUser>[3]>, successMsg: string, providedReason?: string) => {
    if (!token) return;
    if (!ADMIN_ACTION_KEY) {
      toast.error('Admin action key not configured in environment');
      return;
    }
    const reason = providedReason || actionReasons[userId];
    if (!reason || reason.trim().length < 5) {
      toast.error('Action reason is required (minimum 5 characters)');
      return;
    }
    try {
      await adminApi.updateUser(token, ADMIN_ACTION_KEY, userId, { ...payload, reason } as Parameters<typeof adminApi.updateUser>[3]);
      toast.success(successMsg);
      setActionReasons({ ...actionReasons, [userId]: '' });
      setExpandedUserId(null);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const deleteUser = async (user: AdminUserSummary) => {
    if (!token) return;
    if (!ADMIN_ACTION_KEY) {
      toast.error('Admin action key not configured in environment');
      return;
    }
    const reason = actionReasons[user.id];
    if (!reason || reason.trim().length < 5) {
      toast.error('Deletion reason is required (minimum 5 characters)');
      return;
    }
    if (!confirm(`⚠️ FINAL CONFIRMATION: Delete user ${user.email}? This action is irreversible.`)) return;
    try {
      await adminApi.deleteUser(token, ADMIN_ACTION_KEY, user.id, reason);
      toast.success('User account deleted');
      setActionReasons({ ...actionReasons, [user.id]: '' });
      setExpandedUserId(null);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [users],
  );

  const visibleUsers = useMemo(
    () => sortedUsers.filter((u) => planFilter === 'all' || (u.plan === 'pro' ? 'pro' : 'free') === planFilter),
    [sortedUsers, planFilter],
  );

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
        <form onSubmit={handleLogin} className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#7f7fd4]">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            <h1 className="text-lg font-semibold">Admin Dashboard Login</h1>
          </div>
          <p className="text-sm text-slate-500">Use your admin credentials to continue.</p>
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
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Log in as Admin
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-8 dark:from-[#05050b] dark:via-black/40 dark:to-black/60">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="sticky top-4 z-20 rounded-2xl border border-slate-200/80 bg-white/90 p-4 backdrop-blur dark:border-white/10 dark:bg-[#090916]/80">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Admin Control Center</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage users, premium access, quotas, and account lifecycle in real time.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadUsers()}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-white disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
              >
                <RotateCcw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {visibleUsers.length} visible users
            </span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              Filter: {planFilter.toUpperCase()}
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              {isLoading ? 'Syncing...' : 'Synced'}
            </span>
            {lastRefreshedAt && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                Updated: {lastRefreshedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Overview Metrics */}
        {overview && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0d1a]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Users</p>
                  <p className="mt-2 text-2xl font-bold">{overview.totalUsers}</p>
                </div>
                <Users className="h-8 w-8 text-indigo-500 opacity-50" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0d1a]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Premium Users</p>
                  <p className="mt-2 text-2xl font-bold text-amber-600">{overview.proUsers}</p>
                </div>
                <Crown className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0d1a]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Documents</p>
                  <p className="mt-2 text-2xl font-bold">{overview.totalDocuments}</p>
                </div>
                <FileText className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0d1a]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Analyses</p>
                  <p className="mt-2 text-2xl font-bold">{overview.totalAnalyses}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0d0d1a]">
          <div className="flex flex-wrap gap-2">
            {(['all', 'pro', 'free'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setPlanFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  planFilter === filter
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20'
                }`}
              >
                {filter === 'all' ? 'All Plans' : filter.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void loadUsers(e.currentTarget.value);
              }
            }}
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search by name or email"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                void loadUsers('');
              }}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => loadUsers(query)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Search
          </button>
          </div>
        </div>

        {/* User Management Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d0d1a]">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
            <h2 className="font-semibold">User Management</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Click Actions to open secure controls for that user.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left dark:border-white/10 dark:bg-[#0f1020]">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3">Overrides</th>
                  <th className="px-4 py-3">Stats</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading users...</span>
                    </td>
                  </tr>
                ) : visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No users found.</td>
                  </tr>
                ) : (
                  visibleUsers.map((u) => {
                    const plan = u.plan === 'pro' ? 'pro' : 'free';
                    const isExpanded = expandedUserId === u.id;
                    return (
                      <tr key={u.id} className="border-b border-slate-100 dark:border-white/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{u.name}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                          <p className="mt-1 text-xs text-slate-400">Joined: {new Date(u.createdAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className={plan === 'pro' ? 'inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300'}>{plan.toUpperCase()}</p>
                          <p className="text-xs text-slate-500">Expiry: {u.planExpiryDate ? new Date(u.planExpiryDate).toLocaleDateString() : 'N/A'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p>AI: <span className="font-semibold">{u.aiUsageThisMonth}</span></p>
                          <p>Uploads: <span className="font-semibold">{u.uploadUsageThisMonth}</span></p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p>AI Limit: <span className="font-semibold">{u.aiUsageLimitOverride ?? 'default'}</span></p>
                          <p>Upload Limit: <span className="font-semibold">{u.uploadUsageLimitOverride ?? 'default'}</span></p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p>Docs: <span className="font-semibold">{u.documentCount}</span></p>
                          <p>Analyses: <span className="font-semibold">{u.totalAnalyses}</span></p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                            className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                              isExpanded
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20'
                            }`}
                          >
                            {isExpanded ? 'Collapse' : 'Actions'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Expandable Action Panel */}
          {expandedUserId && (
            <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
              {(() => {
                const user = visibleUsers.find((u) => u.id === expandedUserId) || sortedUsers.find((u) => u.id === expandedUserId);
                if (!user) return null;
                const plan = user.plan === 'pro' ? 'pro' : 'free';
                return (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      {/* Premium Management */}
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <p className="mb-3 text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">Premium Access</p>
                        <div className="space-y-2">
                          {plan === 'free' ? (
                            <button
                              onClick={() => updateUser(user.id, { plan: 'pro', planDays: 30 }, 'Premium granted for 30 days')}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
                            >
                              <Crown className="h-4 w-4" /> Grant Premium (30 days)
                            </button>
                          ) : (
                            <button
                              onClick={() => updateUser(user.id, { plan: 'free' }, 'Premium revoked')}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:border-amber-500/30 dark:hover:bg-amber-500/10"
                            >
                              <Ban className="h-4 w-4" /> Revoke Premium
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Usage Reset */}
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                        <p className="mb-3 text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">Usage Counters</p>
                        <button
                          onClick={() => updateUser(user.id, { resetUsage: true }, 'Usage counters reset')}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
                        >
                          <RotateCcw className="h-4 w-4" /> Reset Usage
                        </button>
                      </div>

                      {/* Destructive Action */}
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
                        <p className="mb-3 text-xs font-semibold uppercase text-red-700 dark:text-red-300">⚠️ Danger Zone</p>
                        <button
                          onClick={() => deleteUser(user)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" /> Delete User
                        </button>
                      </div>
                    </div>

                    {/* Quota Overrides */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/40">
                      <p className="mb-3 text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Quota Overrides</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">AI Limit Override</label>
                          <input
                            defaultValue={user.aiUsageLimitOverride ?? ''}
                            placeholder="blank = plan default"
                            className="w-full rounded border border-slate-300 px-2 py-2 dark:border-white/20 dark:bg-black/20"
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              void updateUser(
                                user.id,
                                { aiUsageLimitOverride: raw === '' ? null : Number(raw) },
                                'AI limit override updated',
                                actionReasons[user.id] || 'AI limit adjusted via override field'
                              );
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Upload Limit Override</label>
                          <input
                            defaultValue={user.uploadUsageLimitOverride ?? ''}
                            placeholder="blank = plan default"
                            className="w-full rounded border border-slate-300 px-2 py-2 dark:border-white/20 dark:bg-black/20"
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              void updateUser(
                                user.id,
                                { uploadUsageLimitOverride: raw === '' ? null : Number(raw) },
                                'Upload limit override updated',
                                actionReasons[user.id] || 'Upload limit adjusted via override field'
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Reason for Action */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/40">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 text-slate-500 flex-shrink-0" />
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Reason for Action</label>
                          <textarea
                            value={actionReasons[user.id] || ''}
                            onChange={(e) => setActionReasons({ ...actionReasons, [user.id]: e.target.value })}
                            placeholder="Explain the reason for this action (minimum 5 characters required)"
                            className="w-full rounded border border-slate-300 px-2 py-2 text-xs dark:border-white/20 dark:bg-black/20"
                            rows={3}
                          />
                          <p className="mt-1 text-xs text-slate-500">Required for audit trail • Will be logged</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Audit Log */}
        {auditLogs.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d0d1a]">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <h2 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Admin Actions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-left dark:border-white/10">
                  <tr className="uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target User</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 10).map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-white/5">
                      <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">{log.adminUsername}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-white/10">
                          {log.action?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">{log.targetUserEmail}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{log.reason}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
