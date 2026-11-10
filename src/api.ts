// All data comes from the Flask backend, which reads the parquet files.
// Nothing in the UI is hardcoded.

const BASE = import.meta.env.DEV ? "http://localhost:5000" : "";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`);
  if (!r.ok) throw new Error(`${path} failed (${r.status})`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `${path} failed (${r.status})`);
  }
  return r.json();
}

// ─── types ────────────────────────────────────────────────────────────────
export type Local = {
  niche: string; approx: boolean; listings: number; sellers: number;
  price_pkr: number; discount: number; concentration: number; reviews: number;
  complaint: string; complaint_label: string; complaint_text: string;
  complaint_lift: number; suspicious_share: number;
};

export type ReviewSample = {
  positive: { rating: number; text: string }[];
  negative: { rating: number; text: string }[];
  counted: number; avg_rating: number | null;
};

export type DarazProduct = {
  id: string; image: string | null; title: string; seller: string;
  price_pkr: number; discount: number; rating: number; reviews: number;
};

export type AmazonProduct = {
  asin: string; image: string; title: string; seller: string;
  price_usd: number; price_pkr: number; reviews: number;
  rating: number; satisfaction: number;
};

export type Pair = {
  amazon: AmazonProduct; daraz: DarazProduct; price_diff_pct: number;
};

export type Category = {
  id: string; name: string; image: string; products: number; sellers: number; reviews: number;
  reviews_per_product: number; price_usd: number; price_pkr: number;
  satisfaction: number; concentration: number; complaint_share: number;
  complaint: string | null; complaint_label: string; complaint_text: string;
  price_gaps: number; demand_score: number; quality_score: number;
  price_score: number; room_score: number; has_opening: boolean;
  demand_label: string; competition_label: string; opening_label: string;
  growth_ratio: number | null; growth_label: string | null;
  local: Local | null;
};

export type Detail = Category & {
  detail: {
    issues: { aspect: string; label: string; text: string; severity: number; affected_pct: number }[];
    top_products: AmazonProduct[];
    amazon_reviews: ReviewSample | null;
    daraz_reviews: ReviewSample | null;
    daraz_products: DarazProduct[];
    pairs: Pair[];
    price_buckets: { label: string; low_pkr: number; high_pkr: number; products: number }[];
    sellers: { name: string; products: number; share: number }[];
  };
};

export type Overview = {
  categories: number; amazon_products: number; amazon_sellers: number | null;
  amazon_reviews_analysed: number | null; daraz_listings: number | null;
  daraz_sellers: number | null; daraz_categories: number;
  with_local_data: number; with_opening: number;
};

export type TrendRow = {
  id: string; name: string; image: string; reviews: number; reviews_per_product: number;
  price_pkr: number; growth_ratio: number | null; growth_label: string | null;
  demand_label: string; competition_label: string; sellers: number; products: number;
};

export type Trends = {
  high_demand: TrendRow[]; growing: TrendRow[]; declining: TrendRow[];
  popular: TrendRow[]; has_growth_data: boolean;
};

export type Gaps = {
  quality: { id: string; name: string; image: string; aspect: string; label: string; text: string;
             affected_pct: number; products: number; price_pkr: number }[];
  by_aspect: Record<string, Gaps["quality"]>;
  price: { id: string; name: string; image: string; gaps: number; price_pkr: number; products: number; text: string }[];
  competition: { id: string; name: string; image: string; sellers: number; concentration: number;
                 price_pkr: number; text: string }[];
  local: { niche: string; aspect: string; label: string; text: string; lift: number;
           sellers: number; discount: number; price_pkr: number }[];
};

export type Recommendation = {
  rank: number; id: string; name: string; image: string; score: number; price_pkr: number;
  sellers: number; products: number; reviews: number;
  headline: string; advice: string; has_problem: boolean;
  complaint_label: string; complaint_text: string;
  bars: { label: string; value: number; note: string }[];
  local: Local | null;
};

export type RecResponse = {
  ok: boolean; per_unit_pkr: number; band_pkr: [number, number];
  model: string; risk: string; results: Recommendation[];
  all_prices: { name: string; price_pkr: number }[];
};

// ─── calls ────────────────────────────────────────────────────────────────
export const api = {
  overview:   () => get<Overview>("/overview"),
  categories: () => get<Category[]>("/categories"),
  category:   (id: string) => get<Detail>(`/category/${id}`),
  trends:     () => get<Trends>("/trends"),
  gaps:       () => get<Gaps>("/gaps"),
  recommend:  (b: { budget: number; units: number; model: string; risk: string }) =>
    post<RecResponse>("/recommend", b),
};

export const pkr = (n: number) =>
  "Rs " + Math.round(n).toLocaleString("en-PK");
export const compact = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M"
  : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n);
