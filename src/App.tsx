import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Brain, TrendingUp, Search, Star, ShoppingBag, Package, Target, Globe,
  ArrowRight, ArrowLeft, X, Users, Layers, Sparkles, Menu, AlertTriangle,
  CheckCircle2, Loader2, Wallet, Factory, Repeat, Tag, ShieldCheck, Flame,
  Scale, Info, MessageSquare, ThumbsUp, ThumbsDown, Check,
} from "lucide-react";
import {
  api, pkr, compact,
  type Category, type Detail, type Overview, type Trends, type Gaps,
  type RecResponse, type ReviewSample, type Pair,
} from "./api";

const C = {
  blue: "#3B82F6", teal: "#14B8A6", purple: "#8B5CF6",
  green: "#22C55E", amber: "#F59E0B", red: "#EF4444",
};
const tip = {
  background: "#111827", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, color: "#F8FAFC", fontSize: 13,
};

// ═══════════════════════════════════════════════════════════ PRIMITIVES
function Chip({ children, tone = "blue" }: { children: React.ReactNode; tone?: string }) {
  const map: Record<string, string> = {
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/25",
    teal: "bg-teal-500/15 text-teal-300 border-teal-500/25",
    green: "bg-green-500/15 text-green-300 border-green-500/25",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    red: "bg-red-500/15 text-red-300 border-red-500/25",
    purple: "bg-purple-500/15 text-purple-300 border-purple-500/25",
    slate: "bg-white/5 text-slate-300 border-white/10",
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
    text-xs font-medium border ${map[tone]}`}>{children}</span>;
}

function Meter({ value, label, note, tone = C.blue }: {
  value: number; label: string; note?: string; tone?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-sm text-slate-300">{label}</span>
        {note && <span className="text-xs text-slate-500 text-right">{note}</span>}
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
             style={{ width: `${value}%`, background: tone }} />
      </div>
    </div>
  );
}

function Card({ children, className = "", onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick}
      className={`rounded-2xl border border-white/[0.07] bg-[#111827]/70 backdrop-blur
        ${onClick ? "cursor-pointer hover:border-white/20 hover:-translate-y-0.5" : ""}
        transition-all duration-300 ${className}`}>{children}</div>
  );
}

function Photo({ src, alt, h = "h-40" }: { src: string; alt: string; h?: string }) {
  const [bad, setBad] = useState(false);
  if (bad || !src) {
    return <div className={`${h} w-full flex items-center justify-center`}
      style={{ background: `linear-gradient(135deg, ${C.blue}22, ${C.teal}22)` }}>
      <Package className="w-8 h-8 text-slate-600" /></div>;
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setBad(true)}
    className={`${h} w-full object-cover`} />;
}

function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: C.teal }} />
    <span className="text-sm">{label}</span></div>;
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-6 text-center">
    <AlertTriangle className="w-6 h-6 mx-auto mb-3 text-red-400" />
    <p className="font-semibold mb-1">Couldn't load the data</p>
    <p className="text-sm text-slate-400">{msg}</p>
    <p className="text-sm text-slate-500 mt-3">
      Make sure the backend is running: <code className="text-slate-300">python server.py</code>
    </p></div>;
}

function StepHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="text-center mb-10">
      <div className="inline-flex items-center gap-2.5 mb-4">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>{n}</span>
        <span className="text-xs font-semibold tracking-[0.16em] uppercase text-slate-400">
          Step {n} of 5
        </span>
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-slate-400 max-w-2xl mx-auto">{sub}</p>
    </div>
  );
}

function toneFor(l: string) {
  if (/High demand|Wide open|Clear gap|Growing/.test(l)) return "green";
  if (/Steady|Some/.test(l)) return "blue";
  if (/Dominated|No clear|Slowing|Smaller/.test(l)) return "amber";
  return "slate";
}

// ═══════════════════════════════════════════════════════════ STEP BAR
const STEPS = [
  { id: "products", n: 1, label: "Products & Reviews" },
  { id: "compare", n: 2, label: "Compare Markets" },
  { id: "trends", n: 3, label: "Trends" },
  { id: "gaps", n: 4, label: "Gaps" },
  { id: "advisor", n: 5, label: "Your Plan" },
];

function StepBar({ view, go, picked }: {
  view: string; go: (v: string) => void; picked: Category | null;
}) {
  const cur = STEPS.findIndex(s => s.id === view ||
    ((view === "detail" || view === "pair") && s.id === "compare"));
  return (
    <div className="sticky top-16 z-40 border-b border-white/[0.06] bg-[#08111F]/95 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const done = cur > i, active = cur === i;
          const isCompare = s.id === "compare";
          const target = isCompare ? (picked ? "detail" : "products") : s.id;
          const hint = isCompare && !picked ? "Pick a category first" : undefined;
          return (
            <button key={s.id} onClick={() => go(target)} title={hint}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap
                transition-colors flex-shrink-0
                ${active ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white"}`}>
              <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center
                font-bold ${done ? "bg-teal-500/25 text-teal-300"
                                 : active ? "text-white" : "bg-white/[0.06] text-slate-500"}`}
                style={active ? { background: `linear-gradient(135deg,${C.blue},${C.teal})` } : {}}>
                {done ? <Check className="w-3 h-3" /> : s.n}
              </span>
              <span className="hidden sm:inline">
                {s.label}
                {isCompare && picked && (
                  <span className="text-slate-500"> · {picked.name.split(" ")[0]}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ NAVBAR
function Navbar({ go, home }: { go: (v: string) => void; home: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#08111F]/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <button onClick={home} className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold tracking-tight hidden sm:inline">Opportunity Advisor</span>
        </button>
        <div className="hidden md:flex items-center gap-2">
          <button onClick={home} className="px-3.5 py-2 rounded-lg text-sm text-slate-400 hover:text-white">
            Home
          </button>
          <button onClick={() => go("advisor")}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
            Skip to recommendations
          </button>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-white/[0.06] px-5 py-3 space-y-1 bg-[#08111F]">
          <button onClick={() => { home(); setOpen(false); }}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-300">Home</button>
          {STEPS.map(s => (
            <button key={s.id} onClick={() => { go(s.id); setOpen(false); }}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-300">
              {s.n}. {s.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════ HOME
function Home({ ov, start }: { ov: Overview | null; start: () => void }) {
  const stats = ov ? [
    { l: "Categories analysed", v: String(ov.categories), i: Layers, c: C.blue },
    { l: "Amazon reviews read", v: compact(ov.amazon_reviews_analysed ?? 0), i: Star, c: C.teal },
    { l: "Daraz listings collected", v: compact(ov.daraz_listings ?? 0), i: ShoppingBag, c: C.purple },
    { l: "Local sellers tracked", v: compact(ov.daraz_sellers ?? 0), i: Users, c: C.green },
  ] : [];

  return (
    <div>
      <section className="relative pt-32 pb-16 px-5 overflow-hidden">
        <div className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 55% at 50% 0%, rgba(59,130,246,0.16), transparent 70%)" }} />
        <div className="max-w-3xl mx-auto text-center">
          <Chip tone="teal"><Sparkles className="w-3.5 h-3.5" /> Real reviews from two marketplaces</Chip>
          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            What are buyers
            <span className="block bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(120deg, ${C.blue}, ${C.teal})` }}>
              still unhappy about?
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-400">
            Read what customers actually said on Amazon and Daraz, compare the two markets,
            then get product categories matched to your budget.
          </p>
          <button onClick={start}
            className="mt-9 px-7 py-4 rounded-xl font-semibold text-white inline-flex items-center gap-2"
            style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
            Start with the products <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <section className="px-5 pb-14">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <Card key={s.l} className="p-6">
              <s.i className="w-5 h-5 mb-3" style={{ color: s.c }} />
              <div className="text-3xl font-bold tracking-tight">{s.v}</div>
              <div className="text-sm text-slate-400 mt-1 leading-snug">{s.l}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-center text-sm uppercase tracking-[0.16em] text-slate-500 mb-8">
            Five steps
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { n: 1, t: "Products & Reviews", d: "See real customer reviews from both marketplaces" },
              { n: 2, t: "Compare Markets", d: "Amazon buyers vs Pakistani buyers, side by side" },
              { n: 3, t: "Trends", d: "What's in demand and what's picking up" },
              { n: 4, t: "Gaps", d: "Problems nobody has solved yet" },
              { n: 5, t: "Your Plan", d: "Your budget in, a shortlist out" },
            ].map(s => (
              <Card key={s.n} className="p-5">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm
                  font-bold text-white mb-3" style={{ background: `linear-gradient(135deg,${C.blue},${C.teal})` }}>
                  {s.n}</span>
                <h4 className="font-semibold text-sm mb-1.5">{s.t}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{s.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════ STEP 1: PRODUCTS
function ProductGrid({ cats, open, nudge }: {
  cats: Category[]; open: (id: string) => void; nudge?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = cats.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-6xl mx-auto">
        <StepHead n={1} title="Pick a product category"
          sub="Choose one to read what customers actually wrote about it, on both Amazon and Daraz." />

        {nudge && (
          <div className="max-w-xl mx-auto mb-7 rounded-xl border border-teal-500/30
                          bg-teal-500/[0.08] px-5 py-4 flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.teal }} />
            <p className="text-sm text-slate-300">
              To compare the two markets, choose a category below first. The comparison is
              always for one category at a time.
            </p>
          </div>
        )}

        <div className="relative max-w-md mx-auto mb-9">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a category…"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#111827] border border-white/[0.08]
                       text-sm outline-none focus:border-teal-500/50" />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map(c => (
            <Card key={c.id} onClick={() => open(c.id)} className="overflow-hidden group">
              <div className="relative overflow-hidden">
                <Photo src={c.image} alt={c.name} />
                <div className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(17,24,39,0.95), transparent 60%)" }} />
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="font-semibold leading-snug drop-shadow">{c.name}</h3>
                </div>
                {c.local && (
                  <span className="absolute top-3 right-3">
                    <Chip tone="purple"><Globe className="w-3 h-3" /> PK data</Chip>
                  </span>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-slate-500">Typical price</span>
                  <span className="font-semibold">{pkr(c.price_pkr)}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  {[
                    { l: "Reviews", v: compact(c.reviews) },
                    { l: "Sellers", v: String(c.sellers) },
                    { l: "Products", v: String(c.products) },
                  ].map(x => (
                    <div key={x.l}>
                      <div className="font-bold">{x.v}</div>
                      <div className="text-[11px] text-slate-500">{x.l}</div>
                    </div>
                  ))}
                </div>
                {c.complaint ? (
                  <div className="flex items-start gap-2 text-xs text-amber-300/90">
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{Math.round(c.complaint_share * 100)}% complain: "{c.complaint_label.toLowerCase()}"</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No single complaint stands out</div>
                )}
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center
                                justify-between text-sm text-teal-300 group-hover:gap-2 transition-all">
                  <span>Read the reviews</span><ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
        {shown.length === 0 && <p className="text-center text-slate-500 py-16">No match.</p>}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════ STEP 2: REVIEWS + COMPARE
function ReviewList({ s, tone }: { s: ReviewSample | null; tone: string }) {
  if (!s || (s.positive.length === 0 && s.negative.length === 0)) {
    return <p className="text-sm text-slate-500">No review text available for this category.</p>;
  }
  const Item = ({ r, bad }: { r: { rating: number; text: string }; bad: boolean }) => (
    <div className={`rounded-xl border p-4 ${bad ? "border-red-500/20 bg-red-500/[0.04]"
                                                 : "border-green-500/20 bg-green-500/[0.04]"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating
            ? "fill-amber-400 text-amber-400" : "text-slate-700"}`} />
        ))}
        {bad ? <ThumbsDown className="w-3.5 h-3.5 text-red-400 ml-1" />
             : <ThumbsUp className="w-3.5 h-3.5 text-green-400 ml-1" />}
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">"{r.text}"</p>
    </div>
  );
  return (
    <div className="space-y-5">
      {s.negative.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-red-400/80 mb-3">
            What went wrong
          </p>
          <div className="space-y-3">
            {s.negative.slice(0, 3).map((r, i) => <Item key={i} r={r} bad />)}
          </div>
        </div>
      )}
      {s.positive.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-green-400/80 mb-3">
            What people liked
          </p>
          <div className="space-y-3">
            {s.positive.slice(0, 2).map((r, i) => <Item key={i} r={r} bad={false} />)}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Read from {compact(s.counted)} reviews · average {s.avg_rating} stars
      </p>
    </div>
  );
}

function CategoryDetail({ id, back, next, onPair }: {
  id: string; back: () => void; next: () => void; onPair: (p: Pair) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setD(null); setErr("");
    api.category(id).then(setD).catch(e => setErr(e.message));
    window.scrollTo({ top: 0 });
  }, [id]);

  if (err) return <div className="pt-10 px-5 max-w-3xl mx-auto"><ErrorBox msg={err} /></div>;
  if (!d) return <Spinner label="Loading reviews…" />;

  const L = d.local;
  const det = d.detail;

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-6xl mx-auto">
        <button onClick={back}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Choose a different category
        </button>

        <Card className="overflow-hidden mb-6">
          <div className="grid md:grid-cols-[280px_1fr]">
            <Photo src={d.image} alt={d.name} h="h-52 md:h-full" />
            <div className="p-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{d.name}</h1>
              <div className="flex flex-wrap gap-2 mb-5">
                <Chip tone={toneFor(d.demand_label)}>{d.demand_label}</Chip>
                <Chip tone={toneFor(d.competition_label)}>{d.competition_label}</Chip>
                {d.growth_label && <Chip tone={toneFor(d.growth_label)}>
                  <TrendingUp className="w-3 h-3" /> {d.growth_label}</Chip>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { l: "Typical price", v: pkr(d.price_pkr) },
                  { l: "Products", v: String(d.products) },
                  { l: "Sellers", v: String(d.sellers) },
                  { l: "Reviews", v: compact(d.reviews) },
                ].map(x => (
                  <div key={x.l}>
                    <div className="text-lg font-bold">{x.v}</div>
                    <div className="text-xs text-slate-500">{x.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* ── the reviews, side by side ── */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4" style={{ color: C.amber }} />
              <h3 className="font-semibold">Amazon reviews</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">United States, 2018–2022</p>
            {d.complaint && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 mb-5">
                <p className="font-semibold text-amber-300 text-sm mb-1">
                  Main issue: {d.complaint_label}
                </p>
                <p className="text-sm text-slate-300">
                  {d.complaint_text} Affects {Math.round(d.complaint_share * 100)}% of products here.
                </p>
              </div>
            )}
            <ReviewList s={det.amazon_reviews} tone={C.amber} />
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4" style={{ color: C.purple }} />
              <h3 className="font-semibold">Daraz reviews</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">Pakistan, collected 2026</p>
            {L ? (
              <>
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4 mb-5">
                  <p className="font-semibold text-purple-300 text-sm mb-1">
                    Main issue: {L.complaint_label}
                  </p>
                  <p className="text-sm text-slate-300">
                    {L.complaint_text} It's {L.complaint_lift.toFixed(1)}× more common in bad
                    reviews than good ones.
                  </p>
                </div>
                <ReviewList s={det.daraz_reviews} tone={C.purple} />
              </>
            ) : (
              <p className="text-sm text-slate-400">
                We haven't collected Pakistani data for this category yet.
              </p>
            )}
          </Card>
        </div>

        {/* ── product-by-product comparison ── */}
        {det.pairs.length > 0 && (
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-4 h-4" style={{ color: C.teal }} />
              <h3 className="font-semibold">Product by product</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Tap any row to open the full comparison. These are{" "}
              <b className="text-slate-400">similar products, not the same item</b> — the two
              sites don't share product IDs.
            </p>

            <div className="space-y-3">
              {det.pairs.map((p, i) => (
                <button key={i} onClick={() => onPair(p)}
                  className="w-full text-left grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch
                             rounded-xl hover:bg-white/[0.03] transition-colors p-1 -m-1">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04]
                                  p-3 flex gap-3 items-center">
                    <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                      <Photo src={p.amazon.image} alt={p.amazon.title} h="h-14" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-amber-400/80">
                        Amazon
                      </span>
                      <p className="text-sm leading-snug line-clamp-1">{p.amazon.title}</p>
                      <p className="text-sm font-bold mt-0.5">{pkr(p.amazon.price_pkr)}</p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center justify-center gap-1 px-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">vs</span>
                    <span className={`text-xs font-semibold whitespace-nowrap
                      ${p.price_diff_pct < 0 ? "text-green-400" : "text-slate-500"}`}>
                      {p.price_diff_pct > 0 ? "+" : ""}{p.price_diff_pct}%
                    </span>
                  </div>

                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04]
                                  p-3 flex gap-3 items-center">
                    <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                      <Photo src={p.daraz.image || ""} alt={p.daraz.title} h="h-14" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] uppercase tracking-wider text-purple-400/80">
                        Daraz
                      </span>
                      <p className="text-sm leading-snug line-clamp-1">{p.daraz.title}</p>
                      <p className="text-sm font-bold mt-0.5">{pkr(p.daraz.price_pkr)}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* ── side-by-side comparison ── */}
        {L && (
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-2 mb-5">
              <Scale className="w-4 h-4" style={{ color: C.teal }} />
              <h3 className="font-semibold">The two markets compared</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th className="text-left pb-3 font-medium"></th>
                    <th className="text-right pb-3 font-medium">Amazon (US)</th>
                    <th className="text-right pb-3 font-medium">Daraz (PK)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Typical price", pkr(d.price_pkr), pkr(L.price_pkr)],
                    ["Sellers competing", String(d.sellers), String(L.sellers)],
                    ["Average discount", "not recorded", `${L.discount}%`],
                    ["Main complaint", d.complaint_label, L.complaint_label],
                  ].map(([k, a, b]) => (
                    <tr key={k} className="border-t border-white/[0.06]">
                      <td className="py-3 text-slate-400">{k}</td>
                      <td className="py-3 text-right tabular-nums">{a}</td>
                      <td className="py-3 text-right tabular-nums font-semibold"
                          style={{ color: C.teal }}>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-44 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: "Amazon (US)", sellers: d.sellers },
                                 { name: "Daraz (PK)", sellers: L.sellers }]}
                          layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={12} width={100} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="sellers" name="Sellers" radius={[0, 6, 6, 0]} fill={C.teal} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">
              US buyers mainly complain about <b className="text-amber-300">{d.complaint_label.toLowerCase()}</b>;
              local buyers complain about <b className="text-purple-300">{L.complaint_label.toLowerCase()}</b>.
              With {L.sellers} sellers locally against {d.sellers} in the US and discounts
              around {L.discount}%, getting in is easy but standing out is hard.
            </p>
            <p className="text-xs text-slate-500 mt-3">
              Prices aren't directly comparable across the two countries — compare the seller
              counts and complaints instead.
            </p>
          </Card>
        )}

        {det.issues.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="font-semibold mb-1">Everything buyers complained about</h3>
            <p className="text-xs text-slate-500 mb-5">Most serious first</p>
            <div className="space-y-4">
              {det.issues.slice(0, 6).map(i => (
                <Meter key={i.aspect} value={Math.min(100, i.affected_pct)} label={i.label}
                       note={`${i.affected_pct}% of products`}
                       tone={i.affected_pct > 50 ? C.red : i.affected_pct > 25 ? C.amber : C.blue} />
              ))}
            </div>
          </Card>
        )}

        <button onClick={next}
          className="w-full py-4 rounded-xl font-semibold text-white inline-flex items-center
                     justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
          Next: see the market trends <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════ PRODUCT COMPARISON PAGE
function PairPage({ pair, category, back }: {
  pair: Pair; category: string; back: () => void;
}) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  const a = pair.amazon, z = pair.daraz;

  const Side = ({ img, market, tone, title, seller, price, rating, reviews, extra }: any) => (
    <Card className="overflow-hidden">
      <div className="relative">
        <Photo src={img || ""} alt={title} h="h-56" />
        <span className="absolute top-3 left-3"><Chip tone={tone}>{market}</Chip></span>
      </div>
      <div className="p-6">
        <h3 className="font-semibold leading-snug mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-5">{seller}</p>
        <div className="text-3xl font-bold mb-1">{pkr(price)}</div>
        {extra && <p className="text-sm text-green-400 mb-4">{extra}</p>}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/[0.06]">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} className={`w-4 h-4 ${i <= Math.round(rating)
              ? "fill-amber-400 text-amber-400" : "text-slate-700"}`} />
          ))}
          <span className="text-sm font-semibold ml-1">{rating}</span>
          <span className="text-sm text-slate-500">· {compact(reviews)} reviews</span>
        </div>
      </div>
    </Card>
  );

  const rows: [string, string, string][] = [
    ["Price", pkr(a.price_pkr), pkr(z.price_pkr)],
    ["Customer rating", `${a.rating} stars`, `${z.rating} stars`],
    ["Number of reviews", compact(a.reviews), compact(z.reviews)],
    ["Discount", "not recorded", z.discount > 0 ? `${z.discount}% off` : "none"],
    ["Seller", a.seller, z.seller],
  ];

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-5xl mx-auto">
        <button onClick={back}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to {category}
        </button>

        <div className="text-center mb-8">
          <Chip tone="teal"><Scale className="w-3.5 h-3.5" /> Product comparison</Chip>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Same category, two marketplaces
          </h1>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto text-sm">
            These are similar products from each market, matched on where they sit in their own
            price range. They are not the same item — Amazon and Daraz share no product IDs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mb-8">
          <Side img={a.image} market="Amazon (US)" tone="amber" title={a.title}
                seller={a.seller} price={a.price_pkr} rating={a.rating} reviews={a.reviews} />
          <Side img={z.image} market="Daraz (Pakistan)" tone="purple" title={z.title}
                seller={z.seller} price={z.price_pkr} rating={z.rating} reviews={z.reviews}
                extra={z.discount > 0 ? `${z.discount}% off` : undefined} />
        </div>

        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-5">Side by side</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left pb-3 font-medium"></th>
                <th className="text-right pb-3 font-medium">Amazon</th>
                <th className="text-right pb-3 font-medium">Daraz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, x, y]) => (
                <tr key={k} className="border-t border-white/[0.06]">
                  <td className="py-3 text-slate-400">{k}</td>
                  <td className="py-3 text-right tabular-nums">{x}</td>
                  <td className="py-3 text-right tabular-nums font-semibold"
                      style={{ color: C.teal }}>{y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-6 border-amber-500/20 bg-amber-500/[0.04]">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold mb-2 text-sm">
                The local price is {Math.abs(pair.price_diff_pct)}%{" "}
                {pair.price_diff_pct < 0 ? "lower" : "higher"}
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Don't read that as a bargain. The United States and Pakistan have very different
                incomes, so a lower rupee price is normal rather than a sign of better value.
                What does compare fairly is how many sellers there are and what buyers complain
                about.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════ STEP 3: TRENDS
function TrendsView({ open, next }: { open: (id: string) => void; next: () => void }) {
  const [t, setT] = useState<Trends | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.trends().then(setT).catch(e => setErr(e.message)); }, []);

  if (err) return <div className="pt-10 px-5 max-w-3xl mx-auto"><ErrorBox msg={err} /></div>;
  if (!t) return <Spinner label="Loading trends…" />;

  const pie = t.popular.slice(0, 6).map((p, i) => ({
    name: p.name, value: p.reviews,
    color: [C.blue, C.teal, C.purple, C.green, C.amber, C.red][i],
  }));

  const Row = ({ r, badge, tone }: { r: any; badge: string; tone: string }) => (
    <Card onClick={() => open(r.id)} className="overflow-hidden">
      <div className="relative">
        <Photo src={r.image} alt={r.name} h="h-28" />
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(17,24,39,0.95), transparent 65%)" }} />
        <span className="absolute top-2.5 right-2.5"><Chip tone={tone}>{badge}</Chip></span>
      </div>
      <div className="p-4">
        <h4 className="font-semibold text-sm leading-snug mb-3">{r.name}</h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-slate-500">Reviews</div>
               <div className="font-semibold text-sm">{compact(r.reviews)}</div></div>
          <div><div className="text-slate-500">Sellers</div>
               <div className="font-semibold text-sm">{r.sellers}</div></div>
          <div><div className="text-slate-500">Price</div>
               <div className="font-semibold text-sm">{pkr(r.price_pkr)}</div></div>
        </div>
      </div>
    </Card>
  );

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-6xl mx-auto">
        <StepHead n={3} title="What's in demand"
          sub="Where the buyers are, and which categories picked up over time." />

        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Flame className="w-4 h-4" style={{ color: C.red }} /> Most buyers per product
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {t.high_demand.map(r => <Row key={r.id} r={r} badge={r.demand_label} tone="green" />)}
        </div>

        {t.has_growth_data && (
          <>
            <h3 className="font-semibold mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: C.green }} /> Picking up fastest
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              How much review activity grew in 2021–2022 compared with before
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
              {t.growing.map(r => (
                <Row key={r.id} r={r} badge={r.growth_label || "—"} tone={toneFor(r.growth_label || "")} />
              ))}
            </div>
          </>
        )}

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <h3 className="font-semibold mb-1">Where attention is concentrated</h3>
            <p className="text-xs text-slate-500 mb-4">Share of all customer reviews</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius="45%"
                       outerRadius="78%" paddingAngle={2}>
                    {pie.map((p, i) => <Cell key={i} fill={p.color} stroke="none" />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v: any) => compact(Number(v)) + " reviews"} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-1">Most reviewed categories</h3>
            <p className="text-xs text-slate-500 mb-4">Total customer reviews</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={t.popular.map(p => ({
                  name: p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name,
                  reviews: p.reviews,
                }))} layout="vertical" margin={{ left: 15, right: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11}
                         tickFormatter={v => compact(Number(v))} />
                  <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} width={110} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                           formatter={(v: any) => compact(Number(v))} />
                  <Bar dataKey="reviews" radius={[0, 6, 6, 0]} fill={C.blue} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <button onClick={next}
          className="w-full py-4 rounded-xl font-semibold text-white inline-flex items-center
                     justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
          Next: where the gaps are <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════ STEP 4: GAPS
function GapsView({ open, next }: { open: (id: string) => void; next: () => void }) {
  const [g, setG] = useState<Gaps | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("quality");
  useEffect(() => { api.gaps().then(setG).catch(e => setErr(e.message)); }, []);

  if (err) return <div className="pt-10 px-5 max-w-3xl mx-auto"><ErrorBox msg={err} /></div>;
  if (!g) return <Spinner label="Finding the gaps…" />;

  const tabs = [
    { id: "quality", label: "Product problems", n: g.quality.length, i: AlertTriangle },
    { id: "price", label: "Price gaps", n: g.price.length, i: Tag },
    { id: "competition", label: "Low competition", n: g.competition.length, i: ShieldCheck },
    { id: "local", label: "Pakistan issues", n: g.local.length, i: Globe },
  ];

  const GapCard = ({ img, tone, chip, title, body, footL, footR, id }: any) => (
    <Card onClick={id ? () => open(id) : undefined} className="overflow-hidden">
      {img && <div className="relative"><Photo src={img} alt={title} h="h-28" />
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(17,24,39,0.9), transparent 70%)" }} />
        <span className="absolute top-2.5 left-2.5"><Chip tone={tone}>{chip}</Chip></span></div>}
      <div className="p-5">
        {!img && <div className="mb-3"><Chip tone={tone}>{chip}</Chip></div>}
        <h4 className="font-semibold mb-2 leading-snug">{title}</h4>
        <p className="text-sm text-slate-400">{body}</p>
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex justify-between
                        text-xs text-slate-500">
          <span>{footL}</span><span>{footR}</span>
        </div>
      </div>
    </Card>
  );

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-6xl mx-auto">
        <StepHead n={4} title="Where the openings are"
          sub="Problems buyers keep reporting that nobody has fixed, price ranges nobody covers, and markets with no dominant seller." />

        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 rounded-xl text-sm border inline-flex items-center gap-2
                transition-colors ${tab === t.id
                  ? "border-teal-500/50 bg-teal-500/10 text-teal-300"
                  : "border-white/[0.08] text-slate-400 hover:text-white"}`}>
              <t.i className="w-4 h-4" /> {t.label}
              <span className="text-xs opacity-60">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {tab === "quality" && g.quality.map(q =>
            <GapCard key={q.id + q.aspect} id={q.id} img={q.image}
              tone={q.affected_pct > 55 ? "red" : "amber"} chip={q.label}
              title={q.name} body={q.text}
              footL={`${q.affected_pct}% of products affected`} footR={pkr(q.price_pkr)} />)}

          {tab === "price" && g.price.map(p =>
            <GapCard key={p.id} id={p.id} img={p.image} tone="teal"
              chip={`${p.gaps} empty band${p.gaps > 1 ? "s" : ""}`}
              title={p.name} body={p.text}
              footL={`${p.products} products`} footR={pkr(p.price_pkr)} />)}

          {tab === "competition" && g.competition.map(c =>
            <GapCard key={c.id} id={c.id} img={c.image} tone="green" chip="No dominant seller"
              title={c.name} body={c.text}
              footL={`${c.sellers} sellers`} footR={pkr(c.price_pkr)} />)}

          {tab === "local" && g.local.map(l =>
            <GapCard key={l.niche} tone="purple" chip={l.label}
              title={l.niche.replace(/-/g, " ").replace(/\b\w/g, m => m.toUpperCase())}
              body={`${l.text} It's ${l.lift.toFixed(1)}× more common in bad reviews than good ones.`}
              footL={`${l.sellers} sellers`} footR={`${l.discount}% avg discount`} />)}
        </div>

        {((tab === "quality" && !g.quality.length) || (tab === "price" && !g.price.length) ||
          (tab === "competition" && !g.competition.length) || (tab === "local" && !g.local.length)) && (
          <p className="text-center text-slate-500 py-12">Nothing found in this group.</p>
        )}

        <button onClick={next}
          className="w-full py-4 rounded-xl font-semibold text-white inline-flex items-center
                     justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
          Next: tell us your budget <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════ STEP 5: ADVISOR
function Advisor({ open }: { open: (id: string) => void }) {
  const [budget, setBudget] = useState(500000);
  const [units, setUnits] = useState(200);
  const [model, setModel] = useState("resell");
  const [risk, setRisk] = useState("balanced");
  const [res, setRes] = useState<RecResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const models = [
    { id: "resell", label: "Buy and resell", icon: Repeat,
      desc: "Buy ready-made stock and sell it as it is." },
    { id: "manufacture", label: "Make my own", icon: Factory,
      desc: "Produce your own version — we'll only show categories with a problem to fix." },
    { id: "private_label", label: "Private label", icon: Tag,
      desc: "Put your own brand on an existing product, with small improvements." },
  ];
  const risks = [
    { id: "low", label: "Play it safe", desc: "Skip anything a big seller dominates." },
    { id: "balanced", label: "Balanced", desc: "Weigh demand and opportunity evenly." },
    { id: "high", label: "Go for volume", desc: "Chase the biggest markets even if busy." },
  ];

  async function run() {
    setBusy(true); setErr("");
    try {
      const r = await api.recommend({ budget, units, model, risk });
      setRes(r);
      setTimeout(() => document.getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="pt-10 pb-20 px-5">
      <div className="max-w-3xl mx-auto">
        <StepHead n={5} title="Now tell us about you"
          sub="Four questions, then we'll match categories to your money and your plan." />

        <Card className="p-7 mb-6">
          <div className="mb-8">
            <label className="block font-semibold mb-1.5">How much can you invest?</label>
            <p className="text-sm text-slate-500 mb-3">In Pakistani rupees</p>
            <div className="relative">
              <Wallet className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="number" value={budget} min={1000} step={10000}
                onChange={e => setBudget(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-[#0D1929] border border-white/[0.08]
                           text-xl font-semibold outline-none focus:border-teal-500/50" />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {[100000, 300000, 500000, 1000000, 2500000].map(v => (
                <button key={v} onClick={() => setBudget(v)}
                  className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors
                    ${budget === v ? "border-teal-500/50 bg-teal-500/10 text-teal-300"
                                   : "border-white/[0.08] text-slate-400 hover:text-white"}`}>
                  {v / 100000} lakh
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <label className="block font-semibold mb-1.5">How many items will you stock?</label>
            <p className="text-sm text-slate-500 mb-3">
              Rough is fine — fewer items means each can cost more
            </p>
            <div className="relative">
              <Package className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="number" value={units} min={1} step={10}
                onChange={e => setUnits(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-[#0D1929] border border-white/[0.08]
                           text-xl font-semibold outline-none focus:border-teal-500/50" />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {[50, 100, 200, 500, 1000].map(v => (
                <button key={v} onClick={() => setUnits(v)}
                  className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors
                    ${units === v ? "border-teal-500/50 bg-teal-500/10 text-teal-300"
                                  : "border-white/[0.08] text-slate-400 hover:text-white"}`}>
                  {v} items
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-blue-500/[0.07] border border-blue-500/20 px-4 py-3 text-sm">
              That's about <b style={{ color: C.teal }}>{pkr(budget / Math.max(units, 1))}</b> per item.
            </div>
          </div>

          <div className="mb-8">
            <label className="block font-semibold mb-3">How will you run the business?</label>
            <div className="grid sm:grid-cols-3 gap-3">
              {models.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={`text-left p-4 rounded-xl border transition-all
                    ${model === m.id ? "border-teal-500/60 bg-teal-500/[0.08]"
                                     : "border-white/[0.08] hover:border-white/20"}`}>
                  <m.icon className="w-5 h-5 mb-2.5"
                          style={{ color: model === m.id ? C.teal : "#64748B" }} />
                  <div className="font-semibold text-sm mb-1">{m.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <label className="block font-semibold mb-3">How much competition can you handle?</label>
            <div className="grid sm:grid-cols-3 gap-3">
              {risks.map(r => (
                <button key={r.id} onClick={() => setRisk(r.id)}
                  className={`text-left p-4 rounded-xl border transition-all
                    ${risk === r.id ? "border-teal-500/60 bg-teal-500/[0.08]"
                                    : "border-white/[0.08] hover:border-white/20"}`}>
                  <div className="font-semibold text-sm mb-1">{r.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={run} disabled={busy}
            className="w-full py-4 rounded-xl font-semibold text-white inline-flex items-center
                       justify-center gap-2 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking the data…</>
                  : <><Sparkles className="w-4 h-4" /> Show me what to sell</>}
          </button>
        </Card>

        {err && <ErrorBox msg={err} />}

        {res && (
          <div id="results">
            {!res.ok ? (
              <Card className="p-7 border-amber-500/25 bg-amber-500/[0.05]">
                <h3 className="font-semibold text-lg mb-2">Nothing matches those numbers</h3>
                <p className="text-sm text-slate-400 mb-5">
                  At about {pkr(res.per_unit_pkr)} per item there's no category in range with a
                  clear opening. Try stocking fewer items so each can cost more, or allow more
                  competition.
                </p>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                  {res.all_prices.map(p => (
                    <div key={p.name} className="flex justify-between py-1 border-b border-white/[0.05]">
                      <span className="text-slate-400 truncate pr-3">{p.name}</span>
                      <span className="tabular-nums flex-shrink-0">{pkr(p.price_pkr)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">Here's what we'd look at</h3>
                  <p className="text-sm text-slate-400">
                    About {pkr(res.per_unit_pkr)} per item, so we looked at products priced
                    roughly {pkr(res.band_pkr[0])} to {pkr(res.band_pkr[1])}.
                  </p>
                </div>

                <div className="space-y-5">
                  {res.results.map(r => (
                    <Card key={r.id} className="overflow-hidden">
                      <div className="grid sm:grid-cols-[180px_1fr]">
                        <Photo src={r.image} alt={r.name} h="h-40 sm:h-full" />
                        <div className="p-6 flex items-start justify-between gap-4">
                          <div>
                            <Chip tone={r.rank === 1 ? "green" : "slate"}>
                              {["Best match", "Second choice", "Third choice"][r.rank - 1]}
                            </Chip>
                            <h4 className="text-xl font-bold mt-3">{r.name}</h4>
                            <p className="text-sm text-slate-500 mt-1">
                              {pkr(r.price_pkr)} · {r.sellers} sellers · {compact(r.reviews)} reviews
                            </p>
                          </div>
                          <div className="text-center flex-shrink-0">
                            <div className="text-4xl font-bold" style={{ color: C.teal }}>{r.score}</div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              out of 100</div>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 border-t border-white/[0.06] space-y-4">
                        {r.bars.map(b => (
                          <Meter key={b.label} value={b.value} label={b.label} note={b.note}
                                 tone={b.value > 65 ? C.green : b.value > 40 ? C.blue : C.amber} />
                        ))}
                      </div>

                      <div className="p-6 border-t border-white/[0.06]">
                        <p className={`font-semibold mb-2 ${r.has_problem ? "" : "text-amber-300"}`}>
                          {r.headline}
                        </p>
                        <p className="text-sm text-slate-400">
                          {r.has_problem && r.complaint_text + " "}{r.advice}
                        </p>
                      </div>

                      {r.local && (
                        <div className="p-6 border-t border-white/[0.06]">
                          <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">
                            In the Pakistani market
                          </p>
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            {[{ l: "Typical price", v: pkr(r.local.price_pkr) },
                              { l: "Sellers", v: String(r.local.sellers) },
                              { l: "Avg discount", v: `${r.local.discount}%` }].map(x => (
                              <div key={x.l}>
                                <div className="text-lg font-bold">{x.v}</div>
                                <div className="text-xs text-slate-500">{x.l}</div>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-slate-400">
                            Local buyers mostly complain about{" "}
                            <b className="text-purple-300">{r.local.complaint_label.toLowerCase()}</b>.
                            With {r.local.sellers} sellers competing, getting in is easy but
                            standing out is the hard part.
                          </p>
                        </div>
                      )}

                      <div className="p-6 border-t border-white/[0.06] flex flex-wrap gap-3
                                      items-center justify-between">
                        <ul className="space-y-2 text-sm text-slate-400 flex-1 min-w-[240px]">
                          {["Check what the top sellers here are doing",
                            "Get supplier quotes to know your real profit",
                            "Order a small test batch first"].map(s => (
                            <li key={s} className="flex gap-2.5">
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5"
                                            style={{ color: C.teal }} />{s}
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => open(r.id)}
                          className="px-5 py-2.5 rounded-xl text-sm font-semibold border
                                     border-white/12 hover:bg-white/5 inline-flex items-center gap-2">
                          Read the reviews <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="p-6 mt-6 border-amber-500/20 bg-amber-500/[0.04]">
                  <h4 className="font-semibold mb-3 flex items-center gap-2 text-amber-300">
                    <AlertTriangle className="w-4 h-4" /> Please read before you spend anything
                  </h4>
                  <ul className="space-y-2.5 text-sm text-slate-400">
                    <li>We don't know what these products cost you to buy, so we{" "}
                      <b className="text-slate-200">cannot tell you whether you'd make a profit</b>.</li>
                    <li>Amazon figures cover 2018 to 2022. Pakistani figures were collected in 2026.</li>
                    <li>Prices across the two countries aren't directly comparable — compare the
                      seller counts and complaints instead.</li>
                    <li>We tested these scores against what actually happened later. The demand
                      signal held up reasonably. The "buyers are unhappy" signal did{" "}
                      <b className="text-slate-200">not</b> predict which categories grew — it
                      shows room for a better product, not a growing market.</li>
                  </ul>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════ SHELL
export default function App() {
  const [view, setView] = useState("home");
  const [catId, setCatId] = useState<string | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.overview(), api.categories()])
      .then(([o, c]) => { setOv(o); setCats(c); })
      .catch(e => setErr(e.message));
  }, []);

  const [nudge, setNudge] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);
  const picked = cats.find(c => c.id === catId) || null;

  const go = (v: string) => {
    setNudge(v === "products" && !picked);
    setPair(null);
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const openCat = (id: string) => {
    setCatId(id); setNudge(false); setView("detail"); window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-[#08111F] text-slate-100 antialiased">
      <Navbar go={go} home={() => go("home")} />
      {view !== "home" && <div className="pt-16"><StepBar view={view} go={go} picked={picked} /></div>}

      {err ? (
        <div className="pt-28 px-5 max-w-3xl mx-auto"><ErrorBox msg={err} /></div>
      ) : view === "home" ? (
        <Home ov={ov} start={() => go("products")} />
      ) : (
        <>
          {view === "products" && (cats.length
            ? <ProductGrid cats={cats} open={openCat} nudge={nudge} /> : <Spinner />)}
          {view === "detail" && catId &&
            <CategoryDetail id={catId} back={() => go("products")} next={() => go("trends")}
                            onPair={p => { setPair(p); setView("pair"); }} />}
          {view === "pair" && pair &&
            <PairPage pair={pair} category={picked?.name || "the category"}
                      back={() => { setPair(null); setView("detail"); }} />}
          {view === "trends" && <TrendsView open={openCat} next={() => go("gaps")} />}
          {view === "gaps" && <GapsView open={openCat} next={() => go("advisor")} />}
          {view === "advisor" && <Advisor open={openCat} />}
        </>
      )}

      <footer className="border-t border-white/[0.06] px-5 py-10 mt-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center
                        justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.teal})` }}>
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">AI Product Opportunity Advisor</span>
          </div>
          <p className="text-xs text-slate-500 text-center sm:text-right">
            Amazon reviews (2018–2022) and Daraz Pakistan listings (2026).<br />
            Research tool — not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
