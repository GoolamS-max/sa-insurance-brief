import { useState, useEffect, useRef } from "react";

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Open Sans', sans-serif;
    background: #F7F7F8;
    color: #404041;
    min-height: 100vh;
  }

  .shimmer {
    background: linear-gradient(90deg, #ececec 25%, #f5f5f5 50%, #ececec 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .story-row:hover { background: #F7F7F8 !important; }

  .read-link {
    color: #93C83E;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
    transition: color 0.15s;
  }
  .read-link:hover { color: #6C2D7B; }

  .cat-tab {
    background: none;
    border: none;
    cursor: pointer;
    padding: 10px 14px;
    font-family: 'Open Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #888;
    white-space: nowrap;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    position: relative;
  }
  .cat-tab:hover { color: #6C2D7B; }
  .cat-tab.active { color: #6C2D7B; border-bottom-color: #93C83E; }

  .refresh-btn {
    background: #6C2D7B;
    color: #fff;
    border: none;
    padding: 8px 18px;
    border-radius: 5px;
    font-family: 'Open Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .refresh-btn:hover { background: #7E3591; }
  .refresh-btn:disabled { background: #b39cbf; cursor: not-allowed; }

  .cat-tag {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #93C83E;
    border: 1px solid #93C83E;
    border-radius: 3px;
    padding: 2px 6px;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    .rates-item { display: none; }
    .rates-item:nth-child(-n+4) { display: flex; }
    .featured-layout { flex-direction: column !important; }
  }
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const LANES = [
  { id: "regulatory", label: "Regulatory", icon: "⚖️", topic: "FSCA updates, Prudential Authority, new insurance legislation, Twin Peaks, conduct rules, PPR (Policyholder Protection Rules)" },
  { id: "insurer",    label: "Insurer Update", icon: "🏢", topic: "OUTsurance, Discovery Insure, Santam, Hollard, Old Mutual Insure, Momentum Insure, Sanlam — company news, results, appointments" },
  { id: "market",     label: "Market News", icon: "📊", topic: "SA insurance industry results, mergers, acquisitions, market share, Lloyd's of London SA, economic factors affecting insurers" },
  { id: "claims",     label: "Claims", icon: "📋", topic: "claims trends, fraud, major loss events, claims handling developments, ombudsman rulings" },
  { id: "weather",    label: "Weather & Disasters", icon: "🌩️", topic: "weather events, natural disasters, catastrophe losses, flood and hail events affecting SA insurers" },
  { id: "insurtech",  label: "InsurTech", icon: "💡", topic: "technology innovation, digital insurance, telematics, AI in SA insurance, new product launches" },
  { id: "reinsurance",label: "Reinsurance", icon: "🔄", topic: "reinsurance market developments, capacity, catastrophe bonds affecting South Africa" },
];

const SOURCES = `FA News (fanews.co.za), Cover Magazine (cover.co.za), Insurance Gateway (insurancegateway.co.za), Moneyweb (moneyweb.co.za), BusinessTech (businesstech.co.za), Daily Maverick (dailymaverick.co.za), Fin24, News24 Business, FSCA official website (fsca.co.za), South African Insurance Association (saia.co.za), Ombudsman for Short-Term Insurance (osti.co.za), BizNews, IOL Business, Herald Live Business, Times Live Business, Reinsurance News (reinsurancene.ws), Insurance Business Magazine SA`;

// ─── JSON Extractor ───────────────────────────────────────────────────────────
function extractJsonArray(raw) {
  // Strip markdown fences
  let s = raw.replace(/```json/g, "").replace(/```/g, "");
  const candidates = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "[") continue;
    let depth = 0, inStr = false, esc = false;
    let j = i;
    for (; j < s.length; j++) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === "\\" && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[" || c === "{") depth++;
      if (c === "]" || c === "}") depth--;
      if (depth === 0) break;
    }
    const candidate = s.slice(i, j + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
        candidates.push(parsed);
      }
    } catch (_) {}
  }
  if (candidates.length === 0) return [];
  return candidates.sort((a, b) => b.length - a.length)[0];
}

// ─── API Calls ────────────────────────────────────────────────────────────────
async function fetchLane(lane) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  const systemPrompt = `Today is ${dateStr}. You are an insurance industry news researcher for South Africa. Search the web for real, verifiable SA insurance news articles published today or in the last 48 hours specifically about: ${lane.topic}. Prioritise these sources: ${SOURCES}. Return ONLY a raw JSON array — no markdown, no backticks, no preamble, no explanation. Start with [ and end with ]. Each object must have exactly these fields: title (string), summary (string, 2 sentences max), source (string, publication name), url (string, direct article permalink not homepage), category (string), date (string, ISO or readable), timeAgo (string e.g. "2 hours ago"). Return 4–6 articles, newest first. If fewer than 4 real articles exist, return what you find. Do not fabricate URLs.`;

  const userPrompt = `Search for the latest South African insurance news today (${dateStr}) in the category: ${lane.label}. Return the JSON array only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-calls": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const rawText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  const articles = extractJsonArray(rawText);
  return articles;
}

async function fetchRates() {
  const result = { rUSD: null, rEUR: null, rGBP: null, gold: null, platinum: null, brent: null };

  // Currency: ZAR per foreign unit
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=ZAR&to=USD,EUR,GBP");
    const d = await r.json();
    // d.rates = { USD: 0.053, EUR: 0.049, GBP: 0.042 } (ZAR per 1 of that currency)
    // We want ZAR per 1 USD, so invert: 1/0.053 ≈ 18.87
    if (d.rates) {
      result.rUSD = d.rates.USD ? (1 / d.rates.USD).toFixed(2) : null;
      result.rEUR = d.rates.EUR ? (1 / d.rates.EUR).toFixed(2) : null;
      result.rGBP = d.rates.GBP ? (1 / d.rates.GBP).toFixed(2) : null;
    }
  } catch (_) {}

  // Metals
  try {
    const r = await fetch("https://api.metals.live/v1/spot");
    const d = await r.json();
    // Returns array of {gold: X, silver: X, platinum: X ...} or object
    if (Array.isArray(d)) {
      const obj = d[0];
      result.gold = obj?.gold ? Number(obj.gold).toFixed(2) : null;
      result.platinum = obj?.platinum ? Number(obj.platinum).toFixed(2) : null;
    } else if (d && typeof d === "object") {
      result.gold = d.gold ? Number(d.gold).toFixed(2) : null;
      result.platinum = d.platinum ? Number(d.platinum).toFixed(2) : null;
    }
  } catch (_) {}

  // Brent Crude via Yahoo Finance
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F");
    const d = await r.json();
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price) result.brent = Number(price).toFixed(2);
  } catch (_) {}

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isLastHour(timeAgo = "") {
  const t = timeAgo.toLowerCase();
  if (t.includes("just") || t.includes("now") || t.includes("min")) return true;
  const match = t.match(/(\d+)\s*hour/);
  if (match && parseInt(match[1]) < 1) return true;
  if (t.includes("30 min") || t.includes("45 min") || t.includes("15 min") || t.includes("5 min")) return true;
  return false;
}

function fmt(val, prefix = "") {
  return val ? `${prefix}${val}` : "—";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RatesBar({ rates }) {
  const items = [
    { label: "R/$", value: rates.rUSD ? `R ${rates.rUSD}` : "—" },
    { label: "R/€", value: rates.rEUR ? `R ${rates.rEUR}` : "—" },
    { label: "R/£", value: rates.rGBP ? `R ${rates.rGBP}` : "—" },
    { label: "Gold $", value: rates.gold ? `$${rates.gold}` : "—" },
    { label: "Platinum $", value: rates.platinum ? `$${rates.platinum}` : "—" },
    { label: "Brent $", value: rates.brent ? `$${rates.brent}` : "—" },
  ];

  return (
    <div style={{ background: "#ECECEC", borderBottom: "1px solid #ddd", padding: "6px 20px", display: "flex", gap: "0", overflowX: "auto" }}>
      {items.map((item, i) => (
        <span key={item.label} className="rates-item" style={{ display: "flex", alignItems: "center", gap: "5px", padding: "0 14px 0 0", marginRight: "14px", borderRight: i < items.length - 1 ? "1px solid #ccc" : "none", fontFamily: "'Courier New', monospace", fontSize: "11px", whiteSpace: "nowrap" }}>
          <span style={{ color: "#888" }}>{item.label}</span>
          <span style={{ color: "#404041", fontWeight: 700 }}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function ShimmerSection({ label, icon }) {
  return (
    <div style={{ marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: "#F7F7F8", borderTop: "1px solid #e8e8e8", borderBottom: "1px solid #e8e8e8", padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ fontFamily: "Georgia, serif", fontSize: "15px", fontWeight: 700, color: "#404041" }}>{label}</span>
      </div>
      <div style={{ background: "#fff", padding: "20px" }}>
        <div className="shimmer" style={{ height: "24px", width: "70%", marginBottom: "10px" }} />
        <div className="shimmer" style={{ height: "14px", width: "90%", marginBottom: "6px" }} />
        <div className="shimmer" style={{ height: "14px", width: "80%", marginBottom: "16px" }} />
        <div className="shimmer" style={{ height: "12px", width: "30%" }} />
      </div>
      {[1, 2].map(i => (
        <div key={i} style={{ background: "#fff", borderTop: "1px solid #f0f0f0", padding: "14px 20px", display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div className="shimmer" style={{ height: "14px", width: "65%", marginBottom: "8px" }} />
            <div className="shimmer" style={{ height: "12px", width: "85%" }} />
          </div>
          <div className="shimmer" style={{ height: "20px", width: "70px", borderRadius: "3px" }} />
        </div>
      ))}
    </div>
  );
}

function FeaturedStory({ story }) {
  return (
    <div style={{ background: "#fff", padding: "24px 20px 20px", animation: "fadeIn 0.4s ease" }}>
      <div style={{ marginBottom: "6px" }}>
        <span className="cat-tag">{story.category}</span>
      </div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: "22px", fontWeight: 700, color: "#404041", lineHeight: 1.35, marginBottom: "10px" }}>
        {story.title}
      </h2>
      <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.65, marginBottom: "12px" }}>
        {story.summary}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: "11px", color: "#888", display: "flex", gap: "10px" }}>
          <span style={{ fontWeight: 700, color: "#6C2D7B" }}>{story.source}</span>
          <span>·</span>
          <span>{story.timeAgo || story.date}</span>
        </div>
        <a className="read-link" href={story.url} target="_blank" rel="noopener noreferrer">Read full article →</a>
      </div>
    </div>
  );
}

function CompactStory({ story }) {
  return (
    <div className="story-row" style={{ background: "#fff", borderTop: "1px solid #f0f0f0", padding: "13px 20px", display: "flex", alignItems: "flex-start", gap: "12px", transition: "background 0.15s" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Open Sans', sans-serif", fontSize: "13px", fontWeight: 700, color: "#404041", lineHeight: 1.4, marginBottom: "4px" }}>
          {story.title}
        </div>
        <div style={{ fontSize: "12px", color: "#666", lineHeight: 1.55, marginBottom: "6px" }}>
          {story.summary}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: "10px", color: "#888" }}>
            <span style={{ color: "#6C2D7B", fontWeight: 700 }}>{story.source}</span> · {story.timeAgo || story.date}
          </span>
          <a className="read-link" href={story.url} target="_blank" rel="noopener noreferrer">Read →</a>
        </div>
      </div>
      <span className="cat-tag" style={{ marginTop: "2px", flexShrink: 0 }}>{story.category}</span>
    </div>
  );
}

function TimeGroupDivider({ label }) {
  return (
    <div style={{ background: "#F7F7F8", borderTop: "1px solid #ebebeb", borderBottom: "1px solid #ebebeb", padding: "5px 20px" }}>
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: "10px", fontWeight: 700, color: "#93C83E", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function LaneSection({ lane, articles, loading, error }) {
  if (loading) return <ShimmerSection label={lane.label} icon={lane.icon} />;

  if (error) {
    return (
      <div style={{ marginBottom: "24px" }}>
        <SectionHeader lane={lane} count={0} />
        <div style={{ background: "#fff", padding: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>⚠️</span>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: "12px", color: "#c0392b" }}>{error}</span>
        </div>
      </div>
    );
  }

  if (!articles || articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const lastHour = rest.filter(s => isLastHour(s.timeAgo));
  const earlier = rest.filter(s => !isLastHour(s.timeAgo));

  return (
    <div style={{ marginBottom: "28px", animation: "fadeIn 0.4s ease" }}>
      <SectionHeader lane={lane} count={articles.length} />
      <FeaturedStory story={featured} />
      {rest.length > 0 && (
        <div style={{ background: "#F7F7F8", borderTop: "1px solid #eee", borderBottom: "1px solid #eee", padding: "5px 20px" }}>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: "10px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>More</span>
        </div>
      )}
      {lastHour.length > 0 && <TimeGroupDivider label="Last Hour" />}
      {lastHour.map((s, i) => <CompactStory key={i} story={s} />)}
      {earlier.length > 0 && lastHour.length > 0 && <TimeGroupDivider label="Earlier" />}
      {earlier.map((s, i) => <CompactStory key={i} story={s} />)}
    </div>
  );
}

function SectionHeader({ lane, count }) {
  return (
    <div style={{ background: "#F7F7F8", borderTop: "2px solid #6C2D7B", borderBottom: "1px solid #e8e8e8", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px" }}>{lane.icon}</span>
        <span style={{ fontFamily: "Georgia, serif", fontSize: "15px", fontWeight: 700, color: "#404041" }}>{lane.label}</span>
        {count > 0 && (
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: "10px", color: "#93C83E", background: "#f0fae0", border: "1px solid #c8e89c", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>
            {count}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [laneData, setLaneData] = useState({}); // { laneId: { articles, loading, error } }
  const [rates, setRates] = useState({});
  const [activeTab, setActiveTab] = useState("all");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [allLoading, setAllLoading] = useState(false);
  const navRef = useRef(null);

  const loadedLanes = LANES.filter(l => laneData[l.id] && !laneData[l.id].loading);
  const hasAnyData = loadedLanes.some(l => laneData[l.id]?.articles?.length > 0);

  async function fetchAllLanes() {
    setAllLoading(true);
    // Set all to loading
    const initial = {};
    LANES.forEach(l => { initial[l.id] = { articles: [], loading: true, error: null }; });
    setLaneData(initial);

    // Fetch rates concurrently
    fetchRates().then(setRates).catch(() => {});

    // Fetch each lane concurrently
    const results = await Promise.allSettled(LANES.map(lane => fetchLane(lane)));

    results.forEach((result, i) => {
      const lane = LANES[i];
      setLaneData(prev => ({
        ...prev,
        [lane.id]: {
          articles: result.status === "fulfilled" ? result.value : [],
          loading: false,
          error: result.status === "rejected" ? (result.reason?.message || "Failed to load") : null,
        }
      }));
    });

    const now = new Date();
    setUpdatedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} SAST`);
    setAllLoading(false);
  }

  useEffect(() => { fetchAllLanes(); }, []);

  // Tabs: "all" + lanes that have articles
  const visibleLanes = LANES.filter(l => {
    if (activeTab === "all") return true;
    return l.id === activeTab;
  });

  const tabLanes = LANES.filter(l => laneData[l.id]?.articles?.length > 0);

  return (
    <>
      <style>{STYLE}</style>

      {/* Sticky wrapper */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "0 20px" }}>
          <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontFamily: "Georgia, serif", fontSize: "20px", fontWeight: 700, color: "#404041", letterSpacing: "-0.3px" }}>SA Insurance</span>
              <span style={{ background: "#6C2D7B", color: "#fff", fontFamily: "Georgia, serif", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "3px", letterSpacing: "0.05em" }}>NEWS BRIEF</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {updatedAt && (
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: "11px", color: "#888" }}>
                  UPDATED <span style={{ color: "#404041", fontWeight: 700 }}>{updatedAt}</span>
                </span>
              )}
              <button className="refresh-btn" onClick={fetchAllLanes} disabled={allLoading}>
                {allLoading ? "⟳ Loading…" : "⟳ Refresh Today's News"}
              </button>
            </div>
          </div>
        </div>

        {/* Rates Bar */}
        <RatesBar rates={rates} />

        {/* Category Nav */}
        {hasAnyData && (
          <div ref={navRef} style={{ background: "#fff", borderBottom: "2px solid #ebebeb", overflowX: "auto" }}>
            <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", gap: "0", padding: "0 6px" }}>
              <button className={`cat-tab${activeTab === "all" ? " active" : ""}`} onClick={() => setActiveTab("all")}>
                All
                <span style={{ marginLeft: "5px", fontFamily: "'Courier New', monospace", fontSize: "10px", background: "#f0f0f0", padding: "1px 5px", borderRadius: "8px", color: "#666" }}>
                  {tabLanes.reduce((sum, l) => sum + (laneData[l.id]?.articles?.length || 0), 0)}
                </span>
              </button>
              {tabLanes.map(l => (
                <button key={l.id} className={`cat-tab${activeTab === l.id ? " active" : ""}`} onClick={() => setActiveTab(l.id)}>
                  {l.label}
                  <span style={{ marginLeft: "5px", fontFamily: "'Courier New', monospace", fontSize: "10px", background: "#f0f0f0", padding: "1px 5px", borderRadius: "8px", color: "#666" }}>
                    {laneData[l.id]?.articles?.length || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px 0 40px" }}>
        {visibleLanes.map(lane => (
          <LaneSection
            key={lane.id}
            lane={lane}
            articles={laneData[lane.id]?.articles}
            loading={laneData[lane.id]?.loading ?? true}
            error={laneData[lane.id]?.error}
          />
        ))}
      </div>

      {/* Footer */}
      <footer style={{ background: "#404041", color: "#fff", padding: "16px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
          Created by Shalini Goolam. Internal OUTsurance South Africa use only.
        </span>
      </footer>
    </>
  );
}
