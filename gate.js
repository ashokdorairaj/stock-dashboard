/* Password gate for the public (GitHub Pages) build.
   data.enc.js ships only AES-256-GCM ciphertext (key derived from the password
   via PBKDF2-SHA256). Decryption happens entirely in the browser; a wrong
   password just fails to decrypt. */

(function () {
  const REMEMBER_KEY = "stock_advisor_pw";
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function decrypt(password) {
    const E = window.ENCRYPTED_DASHBOARD;
    if (!E) throw new Error("no encrypted payload");
    const keyMaterial = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64(E.salt), iterations: E.iter || 200000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(E.iv) }, key, b64(E.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function unlock(password, remember) {
    const data = await decrypt(password);
    window.DASHBOARD_DATA = data;
    if (remember) localStorage.setItem(REMEMBER_KEY, password);
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").style.display = "";
    renderDashboard();
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("gate-form");
    const errEl = document.getElementById("gate-error");

    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      try { await unlock(saved, false); return; }
      catch { localStorage.removeItem(REMEMBER_KEY); }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errEl.textContent = "";
      const pw = document.getElementById("gate-pw").value;
      const remember = document.getElementById("gate-remember").checked;
      try { await unlock(pw, remember); }
      catch { errEl.textContent = "Wrong password."; }
    });
    document.getElementById("gate-pw").focus();
  });
})();
