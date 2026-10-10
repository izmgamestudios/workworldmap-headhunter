// claude-usage-meter/background.js
// Polls claude.ai's internal usage endpoint (same one the Settings > Usage page uses),
// normalizes it, stores it, paints the toolbar badge and fires threshold notifications.

const BASE = "https://claude.ai";
const ALARM = "poll-usage";
const POLL_MINUTES = 1;
const MIN_FETCH_GAP_MS = 15_000;
const NOTIFY_LEVELS = [80, 95];

const LABELS = {
  five_hour: "Mevcut oturum (5 saat)",
  seven_day: "Haftalık limit (tüm modeller)",
  seven_day_opus: "Haftalık Opus",
  seven_day_sonnet: "Haftalık Sonnet",
  seven_day_oauth_apps: "Haftalık OAuth uygulamaları",
};
const ORDER = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"];

let inflight = null;

function prettify(key) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

async function getJson(path) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error("auth");
    err.code = "AUTH";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.code = "HTTP";
    throw err;
  }
  return res.json();
}

async function resolveOrgId() {
  const { orgId } = await chrome.storage.local.get("orgId");
  if (orgId) return orgId;
  const orgs = await getJson("/api/organizations");
  const list = Array.isArray(orgs) ? orgs : [];
  const chatOrg =
    list.find((o) => Array.isArray(o.capabilities) && o.capabilities.includes("chat")) || list[0];
  if (!chatOrg || !chatOrg.uuid) {
    const err = new Error("no org");
    err.code = "AUTH";
    throw err;
  }
  await chrome.storage.local.set({ orgId: chatOrg.uuid });
  return chatOrg.uuid;
}

// Accepts any { key: { utilization: number, resets_at: ISO|null } } and ignores the rest.
function normalize(raw) {
  const meters = [];
  for (const [key, val] of Object.entries(raw || {})) {
    if (!val || typeof val !== "object" || typeof val.utilization !== "number") continue;
    meters.push({
      key,
      label: LABELS[key] || prettify(key),
      percent: Math.max(0, Math.min(100, val.utilization)),
      resetsAt: val.resets_at || null,
    });
  }
  meters.sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return meters;
}

function badgeColor(p) {
  if (p >= 85) return "#D93025";
  if (p >= 60) return "#F29900";
  return "#188038";
}

async function paintBadge(state) {
  if (state.error || !state.meters?.length) {
    await chrome.action.setBadgeText({ text: state.error === "AUTH" ? "!" : "?" });
    await chrome.action.setBadgeBackgroundColor({ color: "#5F6368" });
    await chrome.action.setTitle({ title: "Claude Usage Meter — veri alınamadı" });
    return;
  }
  const session = state.meters.find((m) => m.key === "five_hour") || state.meters[0];
  const pct = Math.round(session.percent);
  await chrome.action.setBadgeText({ text: String(pct) });
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor(session.percent) });
  const lines = state.meters.map((m) => `${m.label}: %${Math.round(m.percent)}`);
  await chrome.action.setTitle({ title: lines.join("\n") });
}

async function maybeNotify(meters) {
  const { notified = {} } = await chrome.storage.local.get("notified");
  const next = {};
  for (const m of meters) {
    if (m.key !== "five_hour" && m.key !== "seven_day") continue;
    // A new reset window invalidates previously sent levels.
    const prev = notified[m.key] && notified[m.key].resetsAt === m.resetsAt ? notified[m.key] : null;
    const sent = prev ? prev.levels : [];
    const entry = { resetsAt: m.resetsAt, levels: [...sent] };
    for (const level of NOTIFY_LEVELS) {
      if (m.percent >= level && !sent.includes(level)) {
        entry.levels.push(level);
        chrome.notifications.create(`usage-${m.key}-${level}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: `Claude kotası %${level} doldu`,
          message: `${m.label}: %${Math.round(m.percent)} kullanıldı.`,
        });
      }
    }
    next[m.key] = entry;
  }
  await chrome.storage.local.set({ notified: next });
}

async function doRefresh() {
  let state;
  try {
    let orgId = await resolveOrgId();
    let raw;
    try {
      raw = await getJson(`/api/organizations/${orgId}/usage`);
    } catch (e) {
      // Cached org may be stale (account switch) — resolve once more.
      if (e.code !== "AUTH" && e.code !== "HTTP") throw e;
      await chrome.storage.local.remove("orgId");
      orgId = await resolveOrgId();
      raw = await getJson(`/api/organizations/${orgId}/usage`);
    }
    const meters = normalize(raw);
    if (!meters.length) {
      const err = new Error("empty usage payload");
      err.code = "SHAPE";
      throw err;
    }
    state = { meters, fetchedAt: Date.now(), error: null };
    await maybeNotify(meters);
  } catch (e) {
    const prev = (await chrome.storage.local.get("usage")).usage || {};
    state = {
      meters: prev.meters || [],
      fetchedAt: prev.fetchedAt || null,
      error: e.code || "NETWORK",
      errorMessage: e.message,
    };
  }
  await chrome.storage.local.set({ usage: state, lastAttempt: Date.now() });
  await paintBadge(state);
  return state;
}

async function refresh({ force = false } = {}) {
  if (inflight) return inflight;
  if (!force) {
    const { lastAttempt = 0, usage } = await chrome.storage.local.get(["lastAttempt", "usage"]);
    if (usage && Date.now() - lastAttempt < MIN_FETCH_GAP_MS) return usage;
  }
  inflight = doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

function ensureAlarm() {
  chrome.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  refresh({ force: true });
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  refresh({ force: true });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refresh({ force: true });
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "refresh") {
    refresh({ force: !!msg.force }).then(sendResponse);
    return true;
  }
  return false;
});
