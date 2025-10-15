// static/app.js

// ------------------ State ------------------
let RAW = [];
let FILTERED = [];
const charts = {};
const $ = (id) => document.getElementById(id);

// ------------------ Formatters ------------------
function fmtNumber(n, dp = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
}
function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return Number(n).toLocaleString(undefined, {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}
function fmtDate(d) {
  if (!d) return "–";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
const coerceNum = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[, ]/g, "")));
function median(arr) {
  const vals = arr.filter((x) => Number.isFinite(x)).sort((a,b)=>a-b);
  if (!vals.length) return null;
  const m = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[m] : (vals[m-1] + vals[m]) / 2;
}

// Heuristic: normalize tiny $/sqm into real dollars (~$300–$5,000)
function normalizeCurrency(values) {
  if (!values.length) return { values: [], scale: 1 };
  const max = Math.max(...values);
  let scale = 1;
  if (max > 0 && max < 0.02) scale = 1_000_000;
  else if (max > 0 && max < 20) scale = 1_000;
  return { values: values.map((v) => v * scale), scale };
}

// ---- Axis label helpers ----
function shortStreetLabel(full) {
  if (!full) return "";
  // keep only street part, drop suburb/state
  const base = String(full).split(",")[0].trim(); // "3 Dalton Close"
  const parts = base.split(/\s+/);
  const short = parts.slice(-2).join(" ");        // "Dalton Close"
  return short.length > 16 ? short.slice(0, 14) + "…" : short;
}

// ------------------ Fetch ------------------
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
      `Loaded ${RAW.length} listings for ${payload.summary?.suburb || ""}` +
      (payload.summary?.property_type ? ` · ${payload.summary.property_type}` : "") +
      (payload.summary?.source ? ` (source: ${payload.summary.source})` : "") +
      (payload.summary?.fetched_at_utc ? ` @ ${new Date(payload.summary.fetched_at_utc).toLocaleString()}` : "");
  } catch (err) {
    RAW = []; FILTERED = [];
    renderSummary({}); renderAll();
    $("statusText").textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

// ------------------ Summary ------------------
function renderSummary(summary) {
  $("summaryCount").textContent = fmtNumber(summary.count || 0);
  $("summaryMedianPrice").textContent = fmtMoney(summary.median_price);
  $("summaryMedianPPSQM").textContent =
    summary.median_price_per_sqm && Number.isFinite(summary.median_price_per_sqm)
      ? `\$${fmtNumber(summary.median_price_per_sqm, 0)}/sqm` : "–";
  $("summaryMedianDOM").textContent =
    summary.median_dom != null && Number.isFinite(summary.median_dom)
      ? fmtNumber(summary.median_dom) : "–";
}

// ------------------ Filter ------------------
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

// ------------------ Table ------------------
function renderTable() {
  const tbody = $("propTbody");
  tbody.innerHTML = "";
  const rows = [...FILTERED].sort((a,b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));

  rows.forEach((r) => {
    const land = Number.isFinite(r.land_size_sqm) ? fmtNumber(r.land_size_sqm) : "–";
    const ppsqm = Number.isFinite(r.price_per_sqm) ? `\$${fmtNumber(r.price_per_sqm, 0)}` : "–";
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-gray-50";
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

// ------------------ Charts ------------------
function renderCharts() {
  // ----- Price per sqm (bar) -----
  if ($("priceSqmChart")) {
    destroyChart("priceSqmChart");
    const items = FILTERED.map((r) => ({
      full: r.address?.street ?? r.area_name ?? "—",
      short: shortStreetLabel(r.address?.street ?? r.area_name ?? "—"),
      value: coerceNum(r.price_per_sqm),
    })).filter((p) => Number.isFinite(p.value) && p.value > 0);

    items.sort((a,b) => b.value - a.value);

    const { values: normVals } = normalizeCurrency(items.map((p) => p.value));
    const labelsFull = items.map((p) => p.full);
    const labelsShort = items.map((p) => p.short);

    charts.priceSqmChart = new Chart($("priceSqmChart").getContext("2d"), {
      type: "bar",
      data: {
        labels: labelsShort,
        datasets: [{ label: "Price/sqm (AUD)", data: normVals, borderWidth: 1 }]
      },
      options: {
        responsive: true,
        parsing: false,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 16 } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `$${Number(v).toLocaleString()}` }
          },
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 7,
              maxRotation: 0,
              minRotation: 0
            }
          },
        },
        plugins: {
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              title: (items) => items.map((i) => labelsFull[i.dataIndex]),
              label: (c) => ` $${Number(c.parsed.y).toLocaleString()}/sqm`
            }
          }
        },
      },
    });
  }

  // ----- Days on Market (bar) -----
  if ($("domChart")) {
    destroyChart("domChart");
    const items = FILTERED.map((r) => ({
      full: r.address?.street ?? r.area_name ?? "—",
      short: shortStreetLabel(r.address?.street ?? r.area_name ?? "—"),
      value: coerceNum(r.days_on_market),
    })).filter((p) => Number.isFinite(p.value) && p.value >= 0);

    items.sort((a,b) => b.value - a.value);

    const labelsFull = items.map((p) => p.full);
    const labelsShort = items.map((p) => p.short);
    const values = items.map((p) => p.value);

    charts.domChart = new Chart($("domChart").getContext("2d"), {
      type: "bar",
      data: {
        labels: labelsShort,
        datasets: [{ label: "Days on Market", data: values, borderWidth: 1 }]
      },
      options: {
        responsive: true,
        parsing: false,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 16 } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 7,
              maxRotation: 0,
              minRotation: 0
            }
          },
        },
        plugins: {
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              title: (items) => items.map((i) => labelsFull[i.dataIndex]),
              label: (c) => ` ${Number(c.parsed.y)} days`
            }
          }
        },
      },
    });
  }

  // ----- Bedroom mix (doughnut) -----
  if ($("bedroomMixChart")) {
    destroyChart("bedroomMixChart");
    const hist = {};
    FILTERED.forEach((r) => {
      const b = Number.isFinite(r.bedrooms) ? String(r.bedrooms) : "Unknown";
      hist[b] = (hist[b] || 0) + 1;
    });
    const labels = Object.keys(hist);
    const data   = Object.values(hist);
    charts.bedroomMixChart = new Chart($("bedroomMixChart").getContext("2d"), {
      type: "doughnut",
      data: { labels, datasets: [{ label: "Listings", data }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });
  }

  // ===== NEW: Median Price by Bedrooms (bar) =====
  if ($("priceByBedsChart")) {
    destroyChart("priceByBedsChart");
    // group prices by bedroom count
    const byBeds = {};
    FILTERED.forEach((r) => {
      const beds = Number.isFinite(r.bedrooms) ? r.bedrooms : null;
      if (!Number.isFinite(r.price) || beds === null) return;
      byBeds[beds] = byBeds[beds] || [];
      byBeds[beds].push(coerceNum(r.price));
    });
    const labels = Object.keys(byBeds).sort((a,b)=>Number(a)-Number(b));
    const medians = labels.map((b) => median(byBeds[b]));

    charts.priceByBedsChart = new Chart($("priceByBedsChart").getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Median Price (AUD)", data: medians, borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 12 } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v)=> fmtMoney(v) } } },
        plugins: { tooltip: { callbacks: { label: (c)=> ` ${fmtMoney(c.parsed.y)}` } } },
      }
    });
  }

  // ===== NEW: Price vs Land Size (scatter) =====
  if ($("priceVsLandChart")) {
    destroyChart("priceVsLandChart");
    const pts = FILTERED
      .map((r) => ({
        x: coerceNum(r.land_size_sqm),
        y: coerceNum(r.price),
        label: r.address?.street ?? r.area_name ?? "—",
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);

    charts.priceVsLandChart = new Chart($("priceVsLandChart").getContext("2d"), {
      type: "scatter",
      data: { datasets: [{ label: "Price vs Land (sqm)", data: pts }] },
      options: {
        responsive: true,
        parsing: false,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 12 } },
        scales: {
          x: { title: { display: true, text: "Land size (sqm)" }, ticks: { callback: (v)=> fmtNumber(v) } },
          y: { title: { display: true, text: "Price (AUD)" }, ticks: { callback: (v)=> fmtMoney(v) } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (c) => {
                const p = c.raw;
                return ` ${p.label}: ${fmtMoney(p.y)} @ ${fmtNumber(p.x)} sqm`;
              },
            },
          },
        },
      },
    });
  }
}

// ------------------ Render-all ------------------
function renderAll() {
  applySearch();
  renderTable();
  renderCharts();
}

// ------------------ Events ------------------
$("fetchBtn").addEventListener("click", fetchFromSandbox);
$("searchInput").addEventListener("input", renderAll);
window.addEventListener("DOMContentLoaded", fetchFromSandbox);
