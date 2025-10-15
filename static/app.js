// static/app.js
let RAW = [];
let FILTERED = [];
const charts = {};

const $ = (id) => document.getElementById(id);

// ---------- formatters ----------
function fmtNumber(n, dp = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
}
function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return "–";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
function byDesc(key) { return (a,b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity); }
const coerceNum = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")));
const nonZero = (arr) => arr.some((x) => Number.isFinite(x) && x !== 0);

// ---------- fetch ----------
async function fetchFromSandbox() {
  const suburb = $("suburbInput").value.trim() || "Belmont North";
  const type = $("typeSelect").value.trim();

  const qs = new URLSearchParams({ suburb });
  if (type) qs.set("property_type", type);

  $("statusText").textContent = "Fetching…";
  try {
    const res = await fetch(`/api/properties?${qs.toString()}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || "Request failed");

    RAW = payload.properties || [];
    FILTERED = [...RAW];

    renderSummary(payload.summary || {});
    renderAll();

    $("statusText").textContent =
      `Loaded ${RAW.length} listings for ${payload.summary?.suburb || ""}`
      + (payload.summary?.property_type ? ` · ${payload.summary.property_type}` : "")
      + (payload.summary?.source ? ` (source: ${payload.summary.source})` : "")
      + (payload.summary?.fetched_at_utc ? ` @ ${new Date(payload.summary.fetched_at_utc).toLocaleString()}` : "");
  } catch (err) {
    RAW = []; FILTERED = [];
    renderSummary({});
    renderAll();
    $("statusText").textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

// ---------- summary ----------
function renderSummary(summary) {
  $("summaryCount").textContent = fmtNumber(summary.count || 0);
  $("summaryMedianPrice").textContent = fmtMoney(summary.median_price);
  $("summaryMedianPPSQM").textContent =
    (summary.median_price_per_sqm && Number.isFinite(summary.median_price_per_sqm))
      ? `\$${fmtNumber(summary.median_price_per_sqm, 0)}/sqm` : "–";
  $("summaryMedianDOM").textContent =
    summary.median_dom != null && Number.isFinite(summary.median_dom) ? fmtNumber(summary.median_dom) : "–";
}

// ---------- filter ----------
function applySearch() {
  const q = $("searchInput").value.trim().toLowerCase();
  if (!q) { FILTERED = [...RAW]; return; }
  FILTERED = RAW.filter((r) => {
    const hay = [
      r?.address?.street, r?.property_type, r?.area_name,
      r?.address?.suburb, r?.address?.state
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// ---------- table ----------
function renderTable() {
  const tbody = $("propTbody");
  tbody.innerHTML = "";
  const rows = [...FILTERED].sort(byDesc("price"));

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-gray-50";
    const land = Number.isFinite(r.land_size_sqm) ? fmtNumber(r.land_size_sqm) : "–";
    const ppsqm = Number.isFinite(r.price_per_sqm) ? `\$${fmtNumber(r.price_per_sqm, 0)}` : "–";
    tr.innerHTML = `
      <td class="py-2 pr-4">${r.address?.street ?? "–"}</td>
      <td class="py-2 pr-4">${r.property_type ?? "–"}</td>
      <td class="py-2 pr-4">${fmtNumber(r.bedrooms)}</td>
      <td class="py-2 pr-4">${fmtNumber(r.bathrooms)}</td>
      <td class="py-2 pr-4">${fmtNumber(r.garage_spaces)}</td>
      <td class="py-2 pr-4">${fmtMoney(r.price)}</td>
      <td class="py-2 pr-4">${land}</td>
      <td class="py-2 pr-4">${ppsqm}</td>
      <td class="py-2 pr-4">${fmtDate(r.listing_date)}</td>
      <td class="py-2 pr-4">${r.days_on_market != null ? fmtNumber(r.days_on_market) : "–"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- charts ----------
function renderCharts() {
  // --- Price per sqm (sorted, numeric coercion) ---
  destroyChart("priceSqmChart");
  (() => {
    const pairs = FILTERED.map((r) => ({
      label: r.address?.street ?? r.area_name ?? "—",
      value: coerceNum(r.price_per_sqm)
    })).filter((p) => Number.isFinite(p.value));

    pairs.sort((a,b) => b.value - a.value);
    const labels = pairs.map((p) => p.label);
    const data   = pairs.map((p) => p.value);

    const ctx = $("priceSqmChart").getContext("2d");
    charts.priceSqmChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Price/sqm (AUD)", data }] },
      options: {
        responsive: true,
        parsing: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `$${v.toLocaleString()}` }
          },
          x: { ticks: { maxRotation: 45, minRotation: 45 } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (c) => ` $${Number(c.parsed.y).toLocaleString()}/sqm`
            }
          }
        }
      }
    });
  })();

  // --- Days on Market (sorted, integers) ---
  destroyChart("domChart");
  (() => {
    const pairs = FILTERED.map((r) => ({
      label: r.address?.street ?? r.area_name ?? "—",
      value: coerceNum(r.days_on_market)
    })).filter((p) => Number.isFinite(p.value));

    pairs.sort((a,b) => b.value - a.value);
    const labels = pairs.map((p) => p.label);
    const data   = pairs.map((p) => p.value);

    const ctx = $("domChart").getContext("2d");
    charts.domChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Days on Market", data }] },
      options: {
        responsive: true,
        parsing: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 } // integer ticks
          },
          x: { ticks: { maxRotation: 45, minRotation: 45 } }
        },
        plugins: {
          tooltip: {
            callbacks: { label: (c) => ` ${Number(c.parsed.y).toLocaleString()} days` }
          }
        }
      }
    });
  })();

  // --- Bedroom mix (pie) ---
  destroyChart("bedroomMixChart");
  (() => {
    const hist = {};
    FILTERED.forEach((r) => {
      const b = Number.isFinite(r.bedrooms) ? String(r.bedrooms) : "Unknown";
      hist[b] = (hist[b] || 0) + 1;
    });
    const labels = Object.keys(hist);
    const data   = Object.values(hist);

    const ctx = $("bedroomMixChart").getContext("2d");
    charts.bedroomMixChart = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ label: "Listings", data }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } }
    });
  })();
}

function renderAll() { applySearch(); renderTable(); renderCharts(); }

// ---------- events ----------
$("fetchBtn").addEventListener("click", fetchFromSandbox);
$("searchInput").addEventListener("input", renderAll);
window.addEventListener("DOMContentLoaded", fetchFromSandbox);
