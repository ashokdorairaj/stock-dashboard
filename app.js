/* Renders the dashboard from window.DASHBOARD_DATA (see data.js).
   Pure static JS so index.html works when opened directly from disk.
   On the public (GitHub Pages) build, gate.js decrypts data first and
   then calls renderDashboard(). */

function renderDashboard() {
  const D = window.DASHBOARD_DATA;
  if (!D) {
    document.getElementById("meta").textContent = "No data.js found — run the weekly agent first.";
    return;
  }

  const fmt$ = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtPct = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%");
  const pctClass = (n) => (n == null ? "muted" : n >= 0 ? "pos" : "neg");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // --- Minimal markdown renderer (headings, bold, tables, lists, paragraphs) ---
  function inline(md) {
    return esc(md)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(?!\s)(.+?)\*/g, "<em>$1</em>");
  }

  function renderMd(md) {
    const lines = String(md || "").split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      // table block
      if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const headers = line.split("|").slice(1, -1).map((c) => c.trim());
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
          i++;
        }
        out.push("<table><thead><tr>" + headers.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>"
          + rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("")
          + "</tbody></table>");
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue; }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
          i++;
        }
        out.push("<ul>" + items.join("") + "</ul>");
        continue;
      }
      // paragraph: gather consecutive plain lines
      const para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4})\s|^\s*[-*]\s|^\s*\|/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  const ratingClass = (r) => (r || "").toLowerCase().replace(/\s+/g, "-");

  // --- Header ---
  document.getElementById("meta").textContent =
    `Week of ${D.week} · generated ${D.generated}` + (D.pricesAsOf ? ` · prices as of ${D.pricesAsOf}` : "");

  // --- Picks ---
  const picksEl = document.getElementById("picks");
  if (!D.picks || D.picks.length === 0) {
    picksEl.innerHTML = `<div class="empty">No picks yet — the weekly agent hasn't run.</div>`;
  } else {
    picksEl.innerHTML = D.picks.map((p) => `
      <div class="card">
        <div class="card-head">
          <div><span class="ticker">${esc(p.ticker)}</span> <span class="name">${esc(p.name)}</span></div>
          <div class="price">${fmt$(p.price)}</div>
        </div>
        <div style="margin:6px 0">
          <span class="rating ${ratingClass(p.rating)}">${esc(p.rating)}</span>
          <span class="lynch"> · ${esc(p.lynchCategory || "")}</span>
        </div>
        <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <div class="thesis">${esc(p.thesis)}</div>
        <div class="fair-prices">
          Fair value now: <strong>${esc(p.fairValue || "—")}</strong>
          · 3Y ${fmt$(p.fairPrice3y)} · 5Y ${fmt$(p.fairPrice5y)} · 7Y ${fmt$(p.fairPrice7y)}
        </div>
        <details>
          <summary>Full SecDiver analysis</summary>
          <div class="analysis">${renderMd(p.analysisMd)}</div>
        </details>
      </div>`).join("");
  }

  // --- Portfolio ---
  const pfEl = document.getElementById("portfolio");
  if (!D.portfolio || D.portfolio.length === 0) {
    pfEl.innerHTML = `<div class="empty">No holdings recorded. Use <strong>Record a trade</strong> below (or edit <code>data/portfolio.json</code>) and they'll be reviewed on the next weekly run.</div>`;
  } else {
    let totalCost = 0, totalVal = 0;
    const rows = D.portfolio.map((h) => {
      const cost = h.shares * h.costBasis;
      const val = h.lastPrice != null ? h.shares * h.lastPrice : null;
      const pl = val != null ? (val - cost) / cost : null;
      totalCost += cost;
      if (val != null) totalVal += val;
      return `<tr>
        <td><strong>${esc(h.ticker)}</strong></td>
        <td>${h.shares}</td>
        <td>${fmt$(h.costBasis)}</td>
        <td>${fmt$(h.lastPrice)}</td>
        <td class="${pctClass(pl)}">${fmtPct(pl)}</td>
        <td><span class="rating ${ratingClass(h.verdict)}">${esc(h.verdict || "—")}</span></td>
        <td class="verdict-reason">${esc(h.verdictReason || "")}</td>
      </tr>`;
    }).join("");
    const totPl = totalCost ? (totalVal - totalCost) / totalCost : null;
    pfEl.innerHTML = `<table class="data-table">
      <thead><tr><th>Ticker</th><th>Shares</th><th>Cost basis</th><th>Last price</th><th>P/L</th><th>Verdict</th><th>Why</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4"><strong>Total</strong></td>
        <td class="${pctClass(totPl)}"><strong>${fmtPct(totPl)}</strong></td><td colspan="2"></td></tr></tfoot>
    </table>`;
  }

  // --- Scoreboard ---
  const sbEl = document.getElementById("scoreboard");
  if (!D.scoreboard || D.scoreboard.length === 0) {
    sbEl.innerHTML = `<div class="empty">History builds up as weekly runs accumulate.</div>`;
  } else {
    const rows = D.scoreboard.map((s) => {
      const ret = s.lastPrice != null && s.priceAtPick ? s.lastPrice / s.priceAtPick - 1 : null;
      return `<tr>
        <td class="muted">${esc(s.datePicked)}</td>
        <td><strong>${esc(s.ticker)}</strong></td>
        <td><span class="rating ${ratingClass(s.rating)}">${esc(s.rating || "")}</span></td>
        <td>${fmt$(s.priceAtPick)}</td>
        <td>${fmt$(s.lastPrice)}</td>
        <td class="${pctClass(ret)}">${fmtPct(ret)}</td>
      </tr>`;
    }).join("");
    sbEl.innerHTML = `<table class="data-table">
      <thead><tr><th>Picked</th><th>Ticker</th><th>Rating</th><th>Price at pick</th><th>Latest</th><th>Since pick</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  if (window.initTradeForm) window.initTradeForm();
}

// Local build: data.js sets DASHBOARD_DATA synchronously, render right away.
// Public build: gate.js calls renderDashboard() after decryption instead.
if (window.DASHBOARD_DATA) renderDashboard();
