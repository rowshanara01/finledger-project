#### FinLedger — Full-Stack Expense & Anomaly Analytics

> Multi-user financial ledger with PostgreSQL persistence, full CRUD, Z-score outlier flagging, and formula-safe CSV export

**Live Demo:** https://finledger-demo.example.com  
**Tech Stack:** React · TypeScript · Express · PostgreSQL · Tailwind CSS · CSV Engine  
**Target Role Alignment:** Full-Stack / React Engineer

---

#### 1. Problem Statement
Growing teams struggle to spot sudden SaaS or cloud billing spikes inside raw bank exports without exporting data to slow spreadsheets.

#### 2. My Specific Contribution
Built the per-user PostgreSQL CRUD API, O(n) statistical Z-score anomaly detector, multi-currency UI, 2,500-row benchmark mode, and authenticated RFC-4180 CSV export.

#### 3. Issues I Faced & How I Solved Them
#### Issue 1: UI frame drops when filtering 2,500+ transaction rows on every keystroke
- **What Went Wrong (Symptom):** Typing in the search bar caused noticeable input lag because 2,500 DOM rows and chart totals recalculated synchronously.
- **Root Cause:** Rendering thousands of table rows simultaneously overwhelmed layout recalculation, and category totals looped over the dataset multiple times.
- **How I Solved It:** Switched to single-pass `O(n)` aggregation inside `useMemo` and windowed pagination (15 rows/page), keeping DOM node count constant regardless of dataset size.
- **Outcome:** Maintained 60fps typing responsiveness even after generating 2,500+ stress-test records.

#### Issue 2: Commas inside merchant names breaking exported CSV columns
- **What Went Wrong (Symptom):** Opening exported reports in Excel shifted columns whenever a merchant name contained a comma (e.g., "Cloudflare, Inc.").
- **Root Cause:** Naive `fields.join(",")` serialization did not quote or escape fields containing commas or double quotes.
- **How I Solved It:** Implemented an RFC-4180 compliant CSV serializer that wraps special values in double quotes and escapes internal quotes.
- **Outcome:** 100% clean CSV imports across Excel and Google Sheets.

#### Issue 3: Flat dollar thresholds flagging normal payroll as anomalies
- **What Went Wrong (Symptom):** A static threshold (amount > $1,000) falsely flagged routine contractor payroll while missing $400 spikes in low-cost SaaS subscriptions.
- **Root Cause:** Each expense category has a completely different baseline mean and variance.
- **How I Solved It:** Replaced the flat threshold with per-category Z-score math (`z = (amount - mean) / stdDev`), flagging outliers relative to each category baseline.
- **Outcome:** Eliminated false anomaly flags on payroll while accurately catching cloud billing spikes.

#### Issue 4: Multi-user data bleed, unguarded benchmark wipes, and CSV formula injection
- **What Went Wrong (Symptom):** A single global ledger table mixed records across users, one-click stress testing truncated live entries, and merchant notes starting with "=" could execute formulas in Excel.
- **Root Cause:** Endpoints lacked user-scoped SQL predicates (`WHERE user_id = $1`), lacked confirmation before benchmark resets, and exported raw cell strings without formula neutralization.
- **How I Solved It:** Added per-user Bearer authentication and `user_id` isolation across PostgreSQL CRUD routes, inline edit/delete controls, two-step reset confirmation, and formula-safe RFC-4180 CSV downloads via authenticated Blob fetch.
- **Outcome:** Complete per-account data isolation, full CRUD with multi-currency support, and zero spreadsheet injection risk.

## 4. Measurable Impact & Engineering Highlights
Sub-16ms filter updates across 2,500+ transactions, automatic >1.5σ anomaly detection, and multi-tenant PostgreSQL persistence.

## 5. Quality & Production Checklist
- [x] Live demo deployed and publicly accessible
- [x] First-run Admin setup + automatic PostgreSQL table seeding
- [x] Explicit loading, empty, and error fallback states
- [x] `.env.example` provided with zero committed secrets
- [x] Conventional commit history (`feat:`, `fix:`, `perf:`)

## 6. Local Setup
```bash
git clone https://github.com/username/finledger
cd finledger-full-stack-expense-anomaly-analytics
cp .env.example .env
npm install
npm run dev
```
