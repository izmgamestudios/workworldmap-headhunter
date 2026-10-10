// claude-usage-meter/popup.js
const metersEl = document.getElementById("meters");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");

let state = null;

function level(p) {
  if (p >= 85) return "danger";
  if (p >= 60) return "warn";
  return "";
}

function formatRemaining(iso) {
  if (!iso) return "Sıfırlanma bilgisi yok";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Sıfırlanıyor…";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [];
  if (d) parts.push(`${d} gün`);
  if (h) parts.push(`${h} sa`);
  if (!d) parts.push(`${m} dk`);
  return `Sıfırlanmaya ${parts.join(" ")} kaldı`;
}

function render() {
  metersEl.replaceChildren();
  const meters = (state && state.meters) || [];
  for (const m of meters) {
    const wrap = document.createElement("section");
    wrap.className = "meter";

    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = m.label;
    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = `%${Math.round(m.percent)}`;
    row.append(label, pct);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(m.percent)));
    const fill = document.createElement("div");
    fill.className = `fill ${level(m.percent)}`.trim();
    fill.style.width = `${m.percent}%`;
    bar.append(fill);

    const reset = document.createElement("div");
    reset.className = "reset";
    reset.textContent = formatRemaining(m.resetsAt);
    reset.dataset.resetsAt = m.resetsAt || "";

    wrap.append(row, bar, reset);
    metersEl.append(wrap);
  }
  renderStatus();
}

function renderStatus() {
  statusEl.className = "status";
  statusEl.replaceChildren();
  if (!state) {
    statusEl.textContent = "Yükleniyor…";
    return;
  }
  if (state.error === "AUTH") {
    statusEl.classList.add("error");
    const a = document.createElement("a");
    a.href = "https://claude.ai/login";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "claude.ai'ye giriş yap";
    statusEl.append("Oturum bulunamadı. ", a);
    return;
  }
  if (state.error) {
    statusEl.classList.add("error");
    statusEl.textContent = `Veri alınamadı (${state.error}). Son başarılı veri gösteriliyor.`;
    return;
  }
  if (state.fetchedAt) {
    const sec = Math.max(0, Math.round((Date.now() - state.fetchedAt) / 1000));
    statusEl.textContent = sec < 5 ? "Az önce güncellendi" : `${sec} sn önce güncellendi`;
  }
}

function tick() {
  for (const el of metersEl.querySelectorAll(".reset")) {
    el.textContent = formatRemaining(el.dataset.resetsAt || null);
  }
  renderStatus();
}

async function refresh(force) {
  refreshBtn.classList.add("spin");
  try {
    state = await chrome.runtime.sendMessage({ type: "refresh", force });
  } catch (_) {
    // Service worker may be waking up; fall back to whatever is cached.
    state = (await chrome.storage.local.get("usage")).usage || null;
  }
  refreshBtn.classList.remove("spin");
  render();
}

refreshBtn.addEventListener("click", () => refresh(true));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.usage) {
    state = changes.usage.newValue;
    render();
  }
});

(async () => {
  state = (await chrome.storage.local.get("usage")).usage || null;
  render();
  refresh(false);
  setInterval(tick, 1000);
  setInterval(() => refresh(false), 30_000);
})();
