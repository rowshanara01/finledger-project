import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
export type Language = 'bn' | 'en';

type Category = 'Cloud Infra' | 'SaaS Tools' | 'Payroll' | 'Marketing' | 'Travel';
type CurrencyCode = 'USD' | 'BDT' | 'EUR';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface LedgerRow {
  id: string;
  merchant: string;
  category: Category;
  amount: number;
  date: string;
  paymentMethod: string;
  notes: string;
  zScore: number;
  isAnomaly: boolean;
}

interface ApiLedgerResponse {
  rows: LedgerRow[];
  totalRows: number;
  filteredCount: number;
  page: number;
  totalPages: number;
  totalSpend: number;
  anomalyCount: number;
  categoryTotals: { category: Category; total: number }[];
  maxCatTotal: number;
  serverLatencyMs: number;
}

const CATEGORIES: Category[] = [
  'Cloud Infra',
  'SaaS Tools',
  'Payroll',
  'Marketing',
  'Travel',
];

const PAYMENT_METHODS = ['Card', 'Bank', 'Cash', 'MFS'];

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  BDT: '৳',
  EUR: '€',
};

export function FinLedgerApp({
  lang,
  onAuthChange,
}: {
  lang: Language;
  onAuthChange?: (signedIn: boolean) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [data, setData] = useState<ApiLedgerResponse>({
    rows: [],
    totalRows: 0,
    filteredCount: 0,
    page: 1,
    totalPages: 1,
    totalSpend: 0,
    anomalyCount: 0,
    categoryTotals: CATEGORIES.map((c) => ({ category: c, total: 0 })),
    maxCatTotal: 1,
    serverLatencyMs: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<'ALL' | Category>('ALL');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [newMerchant, setNewMerchant] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('Cloud Infra');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newPayment, setNewPayment] = useState('Card');
  const [newNotes, setNewNotes] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editCategory, setEditCategory] = useState<Category>('Cloud Infra');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPayment, setEditPayment] = useState('Card');
  const [editNotes, setEditNotes] = useState('');

  const [confirmAction, setConfirmAction] = useState<'stress' | 'clear' | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const json = (await res.json()) as { needsSetup: boolean };
        setNeedsSetup(json.needsSetup);
      } else {
        setNeedsSetup(false);
      }
    } catch {
      setNeedsSetup(false);
    }
  }, []);

  useEffect(() => {
    void checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    onAuthChange?.(Boolean(token && user));
  }, [token, user, onAuthChange]);

  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category: selectedCat,
        anomaliesOnly: String(anomaliesOnly),
        search,
        page: String(page),
        pageSize: '15',
      });
      const res = await fetch(`/api/finledger/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setToken(null);
        setUser(null);
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as ApiLedgerResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [token, selectedCat, anomaliesOnly, search, page]);

  useEffect(() => {
    if (token) {
      void fetchTransactions();
    }
  }, [token, fetchTransactions]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const endpoint = needsSetup
        ? '/api/auth/setup'
        : authMode === 'register'
        ? '/api/auth/register'
        : '/api/auth/login';
      const body =
        needsSetup || authMode === 'register'
          ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
          : { email: authEmail.trim(), password: authPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as {
        token?: string;
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok || !payload.token || !payload.user) {
        setAuthError(payload.error || 'Authentication failed.');
        return;
      }
      setToken(payload.token);
      setUser(payload.user);
      setNeedsSetup(false);
      setAuthPassword('');
    } catch {
      setAuthError('Network error while signing in.');
    } finally {
      setAuthBusy(false);
    }
  };

  if (!token || !user) {
    const previewRows = [
      {
        merchant: 'Cloudflare Pro Plan',
        category: 'SaaS Tools',
        date: '2026-11-18',
        amount: '$240.00',
        z: '-0.38σ',
        spike: false,
      },
      {
        merchant: 'AWS EC2 Cluster Burst',
        category: 'Cloud Infra',
        date: '2026-11-21',
        amount: '$2,450.00',
        z: '+1.84σ',
        spike: true,
      },
      {
        merchant: 'Monthly Engineering Payroll',
        category: 'Payroll',
        date: '2026-11-24',
        amount: '$4,100.00',
        z: '+2.12σ',
        spike: true,
      },
    ];

    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <section
          id="overview"
          className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6"
        >
          <div className="space-y-2.5 max-w-2xl">
            <p className="text-xs font-mono font-medium text-blue-600">
              {lang === 'bn'
                ? 'FinLedger · মাল্টি-ইউজার ফিন্যান্সিয়াল লেজার ও অ্যানোমালি ইঞ্জিন'
                : 'FinLedger · Multi-Tenant Expense & Anomaly Engine'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
              {lang === 'bn'
                ? 'খরচের প্রতিটি হিসাব রাখুন, অস্বাভাবিক স্পাইক ধরুন ও নিরাপদ CSV নিন'
                : 'Audit team spend with server O(n) math and Z-score anomaly detection'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 shrink-0">
            <span>USD · BDT · EUR</span>
            <span aria-hidden="true">·</span>
            <span>z ≥ 1.5σ Threshold</span>
            <span aria-hidden="true">·</span>
            <span>2,500-Row Benchmark</span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    {lang === 'bn'
                      ? 'লেজার ও Z-Score বিশ্লেষণ প্রিভিউ'
                      : 'Illustrative Ledger & Z-Score Mechanics'}
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  z = (x − μ) / σ
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">
                        {lang === 'bn' ? 'মার্চেন্ট' : 'Merchant'}
                      </th>
                      <th className="py-2.5 px-4 font-medium">
                        {lang === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                      </th>
                      <th className="py-2.5 px-4 font-medium">
                        {lang === 'bn' ? 'তারিখ' : 'Date'}
                      </th>
                      <th className="py-2.5 px-4 font-medium text-right">
                        {lang === 'bn' ? 'পরিমাণ' : 'Amount'}
                      </th>
                      <th className="py-2.5 px-4 font-medium text-right">Z-Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={row.merchant}>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {row.merchant}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{row.category}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                          {row.date}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-slate-900 tabular-nums">
                          {row.amount}
                        </td>
                        <td
                          className={`py-2.5 px-4 font-mono text-right tabular-nums ${
                            row.spike
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {row.z}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  {lang === 'bn'
                    ? 'সাইন ইন করার পর আপনার নিজস্ব হিসাবের ওপর সার্ভার থেকেই রিয়েল-টাইম Z-score গণনা হবে।'
                    : 'Once signed in, all category totals and Z-scores compute live on your private entries.'}
                </span>
                <span className="font-mono text-amber-700 font-medium shrink-0">
                  Outlier ≥ 1.50σ
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <p className="font-mono text-blue-600 font-semibold">01 · Isolation</p>
                <p className="font-semibold text-slate-900">
                  {lang === 'bn' ? 'আলাদা ইউজার লেজার' : 'Per-Account Scoped SQL'}
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {lang === 'bn'
                    ? 'এক ইউজারের এন্ট্রি অন্য কোনো ইউজার দেখতে বা বদলাতে পারবেন না।'
                    : 'Every query is filtered strictly by your signed Bearer user ID.'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-blue-600 font-semibold">02 · Inline CRUD</p>
                <p className="font-semibold text-slate-900">
                  {lang === 'bn' ? 'এডিট, ডিলিট ও কারেন্সি' : 'Edit, Delete & Currency'}
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {lang === 'bn'
                    ? 'তারিখ, নোটস ও পেমেন্ট মেথডসহ যেকোনো সময় রো আপডেট করুন।'
                    : 'Update merchant, notes, payment method, and USD/BDT/EUR display.'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-blue-600 font-semibold">03 · Export</p>
                <p className="font-semibold text-slate-900">
                  {lang === 'bn' ? 'ফর্মুলা-সেফ CSV' : 'Formula-Safe CSV'}
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {lang === 'bn'
                    ? 'RFC-4180 ও ইনজেকশন সুরক্ষাসহ ফিল্টার করা রিপোর্ট ডাউনলোড।'
                    : 'Neutralizes Excel formula cells and streams filtered rows safely.'}
                </p>
              </div>
            </div>
          </div>

          <div
            id="auth-panel"
            className="scroll-mt-24 lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {needsSetup
                    ? lang === 'bn'
                      ? 'নতুন অ্যাকাউন্ট তৈরি করে শুরু করুন'
                      : 'Create Your Ledger Account'
                    : lang === 'bn'
                    ? 'FinLedger ড্যাশবোর্ডে সাইন ইন'
                    : 'Sign in to FinLedger'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {lang === 'bn'
                    ? 'প্রতিটি ব্যবহারকারীর খরচের হিসাব সম্পূর্ণ আলাদা ও সুরক্ষিত থাকে।'
                    : 'Each account maintains an isolated, private expense ledger.'}
                </p>
              </div>
            </div>

            {needsSetup === false && (
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`py-2 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'bn' ? 'সাইন ইন' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`py-2 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'bn' ? 'নতুন অ্যাকাউন্ট' : 'Create Account'}
                </button>
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {authError}
              </div>
            )}

            <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3.5">
              {(needsSetup || authMode === 'register') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {lang === 'bn' ? 'পূর্ণ নাম' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Sadia Rahman"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'bn' ? 'ইমেইল' : 'Email'}
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="finance@company.io"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'bn'
                    ? 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)'
                    : 'Password (min 6 characters)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authBusy || needsSetup === null}
                className="w-full py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                {authBusy
                  ? lang === 'bn'
                    ? 'যাচাই করা হচ্ছে...'
                    : 'Signing in...'
                  : needsSetup
                  ? lang === 'bn'
                    ? 'অ্যাকাউন্ট তৈরি করে শুরু করুন'
                    : 'Create Account & Start'
                  : authMode === 'register'
                  ? lang === 'bn'
                    ? 'অ্যাকাউন্ট তৈরি করুন'
                    : 'Create Account'
                  : lang === 'bn'
                  ? 'লেজারে প্রবেশ করুন'
                  : 'Open Ledger'}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'নিরাপদ HMAC সেশন ও স্পষ্ট Logout বাটন।'
                  : 'Private multi-tenant storage with clear dashboard Logout.'}
              </span>
            </div>
          </div>
        </div>

        <section
          id="capabilities"
          className="scroll-mt-24 bg-white border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200"
        >
          <div id="workflow" className="scroll-mt-24 p-6 space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-mono font-semibold">O(n) Aggregation</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {lang === 'bn'
                ? '২,৫০০+ রো বেঞ্চমার্ক ও দ্রুত ফিল্টার'
                : '2,500-Row Server Benchmark'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {lang === 'bn'
                ? 'সার্ভার-সাইড পেজিনেশন ও ক্যাটাগরি অ্যাগ্রিগেশন থাকার কারণে হাজার হাজার এন্ট্রি যোগ করলেও ব্রাউজার স্লো হয় না।'
                : 'Test single-pass server aggregation latency across 2,500 generated transactions with instant category filtering.'}
            </p>
          </div>

          <div className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-mono font-semibold">Statistical Math</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {lang === 'bn'
                ? 'স্বয়ংক্রিয় Z-Score ব্যয় সতর্কতা'
                : 'Automated Z-Score Flagging'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {lang === 'bn'
                ? 'যেকোনো নতুন খরচ গড়ের তুলনায় বেশি হলে (z ≥ 1.5σ) তা আলাদা অ্যানোমালি হিসেবে হাইলাইট ও ফিল্টার করা যায়।'
                : 'Flags transactions ≥ 1.5 standard deviations above your mean so unexpected charges stand out immediately.'}
            </p>
          </div>

          <div className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-xs font-mono font-semibold">Safe CSV Export</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {lang === 'bn'
                ? 'ইনজেকশন-মুক্ত CSV ও কারেন্সি'
                : 'Authenticated Spreadsheet Export'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {lang === 'bn'
                ? 'Bearer টোকেন দিয়ে যাচাইকৃত ডাউনলোড এবং USD, BDT ও EUR ফরম্যাটে হিসাব দেখার সুবিধা।'
                : 'Downloads filtered rows via Bearer-authenticated API with formula-injection prefix neutralization.'}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const sym = CURRENCY_SYMBOLS[currency];

  const handleStressTest = async () => {
    await fetch('/api/finledger/stress-test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setConfirmAction(null);
    setPage(1);
    await fetchTransactions();
  };

  const handleClearAll = async () => {
    await fetch('/api/finledger/transactions', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setConfirmAction(null);
    setPage(1);
    await fetchTransactions();
  };

  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    const num = Number(newAmount);
    if (!newMerchant.trim() || Number.isNaN(num) || num <= 0) {
      setErrorBanner('Enter a valid merchant name and positive amount.');
      return;
    }

    const res = await fetch('/api/finledger/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        merchant: newMerchant.trim(),
        category: newCategory,
        amount: num,
        date: newDate,
        paymentMethod: newPayment,
        notes: newNotes.trim(),
      }),
    });

    if (res.ok) {
      setNewMerchant('');
      setNewAmount('');
      setNewNotes('');
      setPage(1);
      await fetchTransactions();
    } else {
      const payload = (await res.json()) as { error?: string };
      setErrorBanner(payload.error || 'Failed to add transaction.');
    }
  };

  const startEditRow = (row: LedgerRow) => {
    setEditingId(row.id);
    setEditMerchant(row.merchant);
    setEditCategory(row.category);
    setEditAmount(String(row.amount));
    setEditDate(row.date);
    setEditPayment(row.paymentMethod || 'Card');
    setEditNotes(row.notes || '');
  };

  const handleSaveEdit = async (id: string) => {
    setErrorBanner(null);
    const num = Number(editAmount);
    if (!editMerchant.trim() || Number.isNaN(num) || num <= 0) {
      setErrorBanner('Merchant and positive amount required.');
      return;
    }
    const res = await fetch(`/api/finledger/transactions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        merchant: editMerchant.trim(),
        category: editCategory,
        amount: num,
        date: editDate,
        paymentMethod: editPayment,
        notes: editNotes.trim(),
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchTransactions();
    } else {
      const payload = (await res.json()) as { error?: string };
      setErrorBanner(payload.error || 'Failed to update transaction.');
    }
  };

  const handleDeleteRow = async (id: string) => {
    const res = await fetch(`/api/finledger/transactions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchTransactions();
    }
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams({
      category: selectedCat,
      anomaliesOnly: String(anomaliesOnly),
      search,
    });
    const res = await fetch(`/api/finledger/export.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setErrorBanner('Failed to export CSV.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'finledger-analytics.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="overview" className="scroll-mt-24 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-900">
            {user.name} ·{' '}
            <span className="font-normal text-slate-500">{user.email}</span>
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {data.totalRows.toLocaleString()} rows · {data.anomalyCount} outliers (z ≥ 1.5σ) · API compute {data.serverLatencyMs}ms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            aria-label="Display currency"
            className="px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
          >
            <option value="USD">USD ($)</option>
            <option value="BDT">BDT (৳)</option>
            <option value="EUR">EUR (€)</option>
          </select>

          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmAction('stress')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {lang === 'bn' ? '২,৫০০ বেঞ্চমার্ক' : '2,500 Benchmark'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmAction('clear')}
            className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
          >
            Clear All
          </button>

          <button
            type="button"
            onClick={() => {
              setToken(null);
              setUser(null);
              void checkAuthStatus();
            }}
            aria-label={lang === 'bn' ? 'লগআউট করুন' : 'Logout'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'লগআউট' : 'Logout'}</span>
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <span>
            {confirmAction === 'stress'
              ? 'Running the 2,500-row benchmark will replace your current ledger entries with synthetic benchmark data. Continue?'
              : 'This will permanently delete all transactions in your ledger so you can start fresh. Continue?'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                void (confirmAction === 'stress' ? handleStressTest() : handleClearAll())
              }
              className="px-3 py-1.5 font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 grid grid-cols-1 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Total Ledger Volume</p>
            <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {sym}
              {data.totalSpend.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Detected Spending Anomalies</p>
            <p className="text-2xl font-semibold text-amber-700 tabular-nums mt-1">
              {data.anomalyCount}
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Spend Distribution by Category (Server O(n) Aggregation)
            </h3>
            <span className="text-xs text-slate-500">Click category to filter</span>
          </div>

          <div className="space-y-3">
            {data.categoryTotals.map((item) => {
              const pct = Math.round((item.total / data.maxCatTotal) * 100);
              const isSelected = selectedCat === item.category;
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => {
                    setSelectedCat(isSelected ? 'ALL' : item.category);
                    setPage(1);
                  }}
                  className="w-full text-left space-y-1 group cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`font-medium ${
                        isSelected ? 'text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      {item.category}
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {sym}
                      {item.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isSelected ? 'bg-blue-600' : 'bg-slate-800 group-hover:bg-blue-600'
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleAddRow(e)}
        className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            value={newMerchant}
            onChange={(e) => setNewMerchant(e.target.value)}
            placeholder="Merchant (e.g. AWS Lambda Burst)"
            className="sm:col-span-4 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as Category)}
            className="sm:col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder={`Amount (${sym})`}
            className="sm:col-span-2 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="sm:col-span-2 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
          />
          <select
            value={newPayment}
            onChange={(e) => setNewPayment(e.target.value)}
            className="sm:col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Optional invoice / expense note..."
            className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Entry</span>
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter merchant, note, or ID..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={anomaliesOnly}
                onChange={(e) => {
                  setAnomaliesOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Anomalies only (z ≥ 1.5σ)</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>
              Page {data.page} / {data.totalPages} ({data.filteredCount.toLocaleString()} rows)
            </span>
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading transactions from backend API...
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No transactions recorded yet. Add your first expense above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">ID</th>
                  <th className="py-2.5 px-4 font-medium">Merchant</th>
                  <th className="py-2.5 px-4 font-medium">Category</th>
                  <th className="py-2.5 px-4 font-medium">Method</th>
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                  <th className="py-2.5 px-4 font-medium text-right">Z-Score</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) =>
                  editingId === row.id ? (
                    <tr key={row.id} className="bg-blue-50/40">
                      <td className="py-2 px-4 font-mono text-slate-500">{row.id}</td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editMerchant}
                          onChange={(e) => setEditMerchant(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                        />
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Note..."
                          className="w-full mt-1 px-2 py-1 border border-slate-200 rounded bg-white text-[11px]"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as Category)}
                          className="px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={editPayment}
                          onChange={(e) => setEditPayment(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                        >
                          {PAYMENT_METHODS.map((pm) => (
                            <option key={pm} value={pm}>
                              {pm}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded bg-white text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-24 px-2 py-1 border border-slate-200 rounded bg-white text-xs font-mono text-right"
                        />
                      </td>
                      <td className="py-2 px-4 text-right text-slate-400">—</td>
                      <td className="py-2 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(row.id)}
                            title="Save"
                            className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            title="Cancel"
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">
                        {row.id}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{row.merchant}</div>
                        {row.notes && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                            {row.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-4 text-slate-500">{row.paymentMethod}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                        {row.date}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-slate-900 tabular-nums">
                        {sym}
                        {row.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right tabular-nums">
                        {row.isAnomaly ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                            <AlertCircle className="w-3 h-3" />+{row.zScore.toFixed(2)}σ
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            {row.zScore >= 0
                              ? `+${row.zScore.toFixed(2)}σ`
                              : `${row.zScore.toFixed(2)}σ`}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditRow(row)}
                            title="Edit transaction"
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteRow(row.id)}
                            title="Delete transaction"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
