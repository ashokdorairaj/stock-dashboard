/* "Record a trade" form: writes trades to stock-advisor/data/portfolio.json in the
   PRIVATE ClaudeProjects repo via the GitHub Contents API, using a fine-grained
   personal access token that the user enters once per device (kept in localStorage,
   never published anywhere). The weekly agent picks the changes up automatically. */

(function () {
  const REPO = "ashokdorairaj/ClaudeProjects";
  const FILE = "stock-advisor/data/portfolio.json";
  const BRANCH = "main";
  const TOKEN_KEY = "stock_advisor_gh_token";

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function html() {
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    return `
    <details class="trade-box" id="trade-details">
      <summary>➕ Record a trade</summary>
      <form id="trade-form" class="trade-form">
        <div class="trade-row">
          <select id="tr-action"><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
          <input id="tr-ticker" placeholder="Ticker (e.g. MU)" required maxlength="6" style="text-transform:uppercase">
          <input id="tr-shares" type="number" step="any" min="0.0001" placeholder="Shares" required>
          <input id="tr-price" type="number" step="any" min="0.01" placeholder="Price $" required>
          <input id="tr-date" type="date">
          <button type="submit">Save</button>
        </div>
        <div class="trade-row token-row" ${hasToken ? 'style="display:none"' : ""} id="token-row">
          <input id="tr-token" type="password" placeholder="GitHub token (one-time setup)" autocomplete="off">
          <details class="token-help"><summary>How do I get a token?</summary>
            <ol>
              <li>Open <strong>github.com &gt; Settings &gt; Developer settings &gt; Personal access tokens &gt; Fine-grained tokens &gt; Generate new token</strong></li>
              <li>Repository access: <strong>Only select repositories</strong> &rarr; <code>ClaudeProjects</code></li>
              <li>Permissions: <strong>Contents &rarr; Read and write</strong>. Set a long expiration.</li>
              <li>Paste the token here. It is stored only in this browser (localStorage).</li>
            </ol>
          </details>
        </div>
        <div id="trade-status" class="trade-status"></div>
        <div class="trade-row muted" style="font-size:.75rem">
          Saves to <code>${FILE}</code> in the private repo.
          ${hasToken ? '<a href="#" id="tr-clear-token">Forget token on this device</a>' : ""}
        </div>
      </form>
    </details>`;
  }

  const b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64decode = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));

  async function gh(path, opts = {}, token) {
    const res = await fetch(`https://api.github.com/${path}`, {
      ...opts,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  function applyTrade(portfolio, t) {
    portfolio.trade_log = portfolio.trade_log || [];
    portfolio.positions = portfolio.positions || [];
    portfolio.trade_log.push({ date: t.date, action: t.action, ticker: t.ticker, shares: t.shares, price: t.price, via: "dashboard" });
    const pos = portfolio.positions.find((p) => p.ticker.toUpperCase() === t.ticker);
    if (t.action === "BUY") {
      if (pos) {
        const newShares = pos.shares + t.shares;
        pos.cost_basis = Math.round(((pos.shares * pos.cost_basis + t.shares * t.price) / newShares) * 100) / 100;
        pos.shares = newShares;
      } else {
        portfolio.positions.push({ ticker: t.ticker, shares: t.shares, cost_basis: t.price, buy_date: t.date });
      }
    } else { // SELL
      if (!pos) throw new Error(`You don't have a recorded position in ${t.ticker}`);
      if (t.shares > pos.shares) throw new Error(`You only hold ${pos.shares} shares of ${t.ticker}`);
      pos.shares -= t.shares;
      if (pos.shares <= 0.0001) portfolio.positions = portfolio.positions.filter((p) => p !== pos);
    }
    return portfolio;
  }

  async function saveTrade(t, token) {
    const cur = await gh(`repos/${REPO}/contents/${FILE}?ref=${BRANCH}`, {}, token);
    let portfolio;
    try { portfolio = JSON.parse(b64decode(cur.content)); }
    catch { throw new Error("portfolio.json in the repo is not valid JSON — fix it manually first"); }
    applyTrade(portfolio, t);
    await gh(`repos/${REPO}/contents/${FILE}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `record trade: ${t.action} ${t.shares} ${t.ticker} @ ${t.price} (via dashboard)`,
        content: b64encode(JSON.stringify(portfolio, null, 2) + "\n"),
        sha: cur.sha,
        branch: BRANCH,
      }),
    }, token);
    return portfolio;
  }

  window.initTradeForm = function () {
    const section = document.getElementById("portfolio-section");
    if (!section || document.getElementById("trade-details")) return;
    section.insertAdjacentHTML("beforeend", html());

    const dateEl = document.getElementById("tr-date");
    dateEl.value = new Date().toISOString().slice(0, 10);
    const status = document.getElementById("trade-status");

    const clearLink = document.getElementById("tr-clear-token");
    if (clearLink) clearLink.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(TOKEN_KEY);
      document.getElementById("token-row").style.display = "";
      clearLink.remove();
    });

    document.getElementById("trade-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      status.textContent = "";
      status.className = "trade-status";
      let token = localStorage.getItem(TOKEN_KEY);
      const entered = (document.getElementById("tr-token") || {}).value;
      if (entered) token = entered.trim();
      if (!token) {
        status.textContent = "Enter a GitHub token first (see 'How do I get a token?').";
        status.classList.add("neg");
        document.getElementById("token-row").style.display = "";
        return;
      }
      const t = {
        action: document.getElementById("tr-action").value,
        ticker: document.getElementById("tr-ticker").value.trim().toUpperCase(),
        shares: parseFloat(document.getElementById("tr-shares").value),
        price: parseFloat(document.getElementById("tr-price").value),
        date: dateEl.value || new Date().toISOString().slice(0, 10),
      };
      if (!t.ticker || !(t.shares > 0) || !(t.price > 0)) {
        status.textContent = "Fill in ticker, shares, and price.";
        status.classList.add("neg");
        return;
      }
      status.textContent = "Saving…";
      try {
        const portfolio = await saveTrade(t, token);
        localStorage.setItem(TOKEN_KEY, token);
        document.getElementById("token-row").style.display = "none";
        const pos = portfolio.positions.map((p) => `${p.ticker}: ${p.shares} @ $${p.cost_basis}`).join(" · ") || "none";
        status.innerHTML = `✅ Saved <strong>${esc(t.action)} ${t.shares} ${esc(t.ticker)} @ $${t.price}</strong>.` +
          ` Current positions: ${esc(pos)}. Full P/L and SELL/HOLD review appears after the next weekly run.`;
        status.classList.add("pos");
        document.getElementById("trade-form").reset();
        dateEl.value = t.date;
      } catch (err) {
        status.textContent = "❌ " + err.message;
        status.classList.add("neg");
      }
    });
  };
})();
