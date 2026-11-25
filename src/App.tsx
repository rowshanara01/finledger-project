import { useState } from 'react';
import { FinLedgerApp, Language } from './components/FinLedgerApp';

const APP_NAME = "FinLedger";
const BRAND_TEXT = "FinLedger";
const SUBTITLE_EN = "High-Throughput Ledger & Statistical Anomaly Analytics Engine";
const SUBTITLE_BN = "হাই-থ্রুপুট এক্সপেন্স অ্যানালিটিক্স ও Z-Score অ্যানোমালি ডিটেকশন ইঞ্জিন";
const STACK_LABEL = "React · TypeScript · Memoized Indexing · SVG Charts · CSV Engine";
const TARGET_ROLE = "Frontend / React / Data-Heavy UI Engineer";
const THEME = {"headerCls":"bg-white/95 backdrop-blur-sm text-slate-900 border-b border-slate-200","brandCls":"text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0","brandText":"FinLedger","navCls":"hidden md:flex items-center gap-6 text-sm font-medium text-slate-600","navLinkHover":"hover:text-blue-600","switchWrapCls":"flex items-center p-1 bg-slate-100 rounded-lg shrink-0","switchActiveCls":"bg-white text-slate-900 shadow-sm","switchIdleCls":"text-slate-600 hover:text-slate-900","footerCls":"bg-white text-slate-900 border-t border-slate-200 mt-auto","footerHeadingCls":"text-xs font-semibold text-slate-900","footerTitleCls":"text-sm font-bold text-slate-900","footerMutedCls":"text-xs text-slate-500","footerLinkCls":"text-slate-600 hover:text-blue-600 whitespace-nowrap","footerBtnCls":"px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer","footerBorderCls":"pt-6 mt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500","nav1En":"Overview","nav1Bn":"ওভারভিউ","nav2En":"Benchmark","nav2Bn":"বেঞ্চমার্ক","nav3En":"Analytics","nav3Bn":"অ্যানালিটিক্স","nav4En":"Sign In","nav4Bn":"সাইন ইন"};

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [signedIn, setSignedIn] = useState(false);
  const [healthText, setHealthText] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = (await res.json()) as { status?: string; storage?: string; error?: string };
      if (res.ok && data.status === 'ok') {
        const storageLabel = data.storage === 'postgresql' ? 'PostgreSQL' : 'In-Memory';
        setHealthText(
          lang === 'bn'
            ? `সার্ভার সচল · ${storageLabel}`
            : `API Healthy · ${storageLabel}`
        );
      } else {
        setHealthText(data.error || 'Health check failed');
      }
    } catch {
      setHealthText(lang === 'bn' ? 'সার্ভারে সংযোগ পাওয়া যায়নি' : 'Unable to reach /api/health');
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className={`sticky top-0 z-30 h-16 ${THEME.headerCls}`}>
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-8 flex items-center justify-between gap-8">
          <a href="#top" className={THEME.brandCls}>
            {BRAND_TEXT}
          </a>

          <nav aria-label="Primary navigation" className={THEME.navCls}>
            {signedIn ? (
              <>
                <a
                  href="#overview"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}
                </a>
                <a
                  href="#top"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? 'উপরে ফিরুন' : 'Back to Top'}
                </a>
              </>
            ) : (
              <>
                <a
                  href="#overview"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? THEME.nav1Bn : THEME.nav1En}
                </a>
                <a
                  href="#workflow"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? THEME.nav2Bn : THEME.nav2En}
                </a>
                <a
                  href="#capabilities"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? THEME.nav3Bn : THEME.nav3En}
                </a>
                <a
                  href="#auth-panel"
                  className={`transition-colors whitespace-nowrap shrink-0 ${THEME.navLinkHover}`}
                >
                  {lang === 'bn' ? THEME.nav4Bn : THEME.nav4En}
                </a>
              </>
            )}
          </nav>

          <div
            className={THEME.switchWrapCls}
            role="group"
            aria-label="Language switch"
          >
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'en' ? THEME.switchActiveCls : THEME.switchIdleCls
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('bn')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'bn' ? THEME.switchActiveCls : THEME.switchIdleCls
              }`}
            >
              বাংলা
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
        <FinLedgerApp lang={lang} onAuthChange={setSignedIn} />
      </main>

      <footer className={THEME.footerCls}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-5 space-y-2">
              <p className={THEME.footerTitleCls}>{APP_NAME}</p>
              <p className={`leading-relaxed ${THEME.footerMutedCls}`}>
                {lang === 'bn' ? SUBTITLE_BN : SUBTITLE_EN}
              </p>
              <p className={`font-mono ${THEME.footerMutedCls}`}>{STACK_LABEL}</p>
            </div>

            <div className="md:col-span-4 space-y-2">
              <p className={THEME.footerHeadingCls}>
                {lang === 'bn' ? 'দ্রুত লিংক' : 'Navigation'}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <a href="#overview" className={THEME.footerLinkCls}>
                  {lang === 'bn' ? THEME.nav1Bn : THEME.nav1En}
                </a>
                {!signedIn ? (
                  <>
                    <a href="#workflow" className={THEME.footerLinkCls}>
                      {lang === 'bn' ? THEME.nav2Bn : THEME.nav2En}
                    </a>
                    <a href="#capabilities" className={THEME.footerLinkCls}>
                      {lang === 'bn' ? THEME.nav3Bn : THEME.nav3En}
                    </a>
                    <a href="#auth-panel" className={THEME.footerLinkCls}>
                      {lang === 'bn' ? THEME.nav4Bn : THEME.nav4En}
                    </a>
                  </>
                ) : (
                  <a href="#top" className={THEME.footerLinkCls}>
                    {lang === 'bn' ? 'উপরে ফিরুন' : 'Back to top'}
                  </a>
                )}
              </div>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <p className={THEME.footerHeadingCls}>
                {lang === 'bn' ? 'সার্ভার ও ডেটাবেজ যাচাই' : 'Server & Database'}
              </p>
              <button
                type="button"
                disabled={checkingHealth}
                onClick={() => void handleCheckHealth()}
                className={THEME.footerBtnCls}
              >
                {checkingHealth
                  ? lang === 'bn'
                    ? 'যাচাই হচ্ছে...'
                    : 'Checking...'
                  : lang === 'bn'
                  ? 'API হেলথ চেক করুন'
                  : 'Check /api/health'}
              </button>
              {healthText && (
                <p className="text-xs font-mono text-emerald-500">{healthText}</p>
              )}
            </div>
          </div>

          <div className={THEME.footerBorderCls}>
            <span>
              © {new Date().getFullYear()} {APP_NAME} · {TARGET_ROLE}
            </span>
            <a href="#top" className={THEME.footerLinkCls}>
              {lang === 'bn' ? 'উপরে ফিরুন' : 'Back to top'}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
