/* ============================================================
   auth.js — GSS Inventory System
   Session management + page protection
   Include BEFORE common.js on every page
   ============================================================ */

const _SB_AUTH_URL = "https://wlyrejxbbxyjocfrwfyk.supabase.co";
const _SB_AUTH_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndseXJlanhiYnh5am9jZnJ3ZnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTIxOTIsImV4cCI6MjEwNDE2ODE5Mn0.38q1she-z0NcdWYgs5nPtOq1T73dFMkK1gJyPDzDQp0";
const _SESSION_KEY = "gss_session";

/* ── Get session from localStorage ── */
function _getSession() {
  try {
    const raw = localStorage.getItem(_SESSION_KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    if (!sess || !sess.access_token) return null;
    // Check expiry (with 60s buffer)
    if (
      sess.expires_at &&
      sess.expires_at - 60 < Math.floor(Date.now() / 1000)
    ) {
      // Try refresh token before giving up
      return sess; // return anyway, refresh runs async
    }
    return sess;
  } catch (e) {
    return null;
  }
}

function _saveSession(data) {
  const sess = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at:
      data.expires_at ||
      Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user || {},
  };
  localStorage.setItem(_SESSION_KEY, JSON.stringify(sess));
  return sess;
}

/* ── Get current logged-in user info ── */
function getCurrentUser() {
  const sess = _getSession();
  if (!sess) return null;
  const u = sess.user || {};
  const meta = u.user_metadata || {};
  const name = meta.full_name || u.email || "Staff";
  return {
    id: u.id || "",
    email: u.email || "",
    name: name,
    role: meta.role || "staff",
    initials:
      name
        .split(" ")
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 2) || "S",
  };
}

async function _getUserProfile(userId) {
  const res = await fetch(
    `${_SB_AUTH_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: getAuthHeaders() },
  );
  if (!res.ok) {
    throw new Error("Unable to verify account permissions");
  }
  const profiles = await res.json();
  return Array.isArray(profiles) ? profiles[0] || null : null;
}

/* ── Protect administrator-only pages and actions ── */
async function requireAdmin() {
  const user = requireAuth();
  if (!user || !user.id) return false;

  try {
    const profile = await _getUserProfile(user.id);
    if (!profile || profile.role !== "admin") {
      window.location.replace("index.html");
      return false;
    }
    document.body.style.visibility = "visible";
    return true;
  } catch (err) {
    console.error("Admin permission check failed", err);
    localStorage.removeItem(_SESSION_KEY);
    window.location.replace("login.html");
    return false;
  }
}

function _setAdminNavVisibility(isAdmin) {
  document.querySelectorAll('a[href="admin.html"]').forEach((link) => {
    link.style.display = isAdmin ? "" : "none";
  });
}

/* ── Auth headers for Supabase REST requests ── */
function getAuthHeaders() {
  const sess = _getSession();
  const token = sess && sess.access_token ? sess.access_token : _SB_AUTH_KEY;
  return {
    apikey: _SB_AUTH_KEY,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/* ══════════════════════════════════════════
   requireAuth — call on every protected page
   Redirects to login if not authenticated
══════════════════════════════════════════ */
function requireAuth() {
  const sess = _getSession();
  if (!sess || !sess.access_token) {
    window.location.replace("login.html");
    return null;
  }
  // Show user in UI after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _renderUserChip);
  } else {
    _renderUserChip();
  }
  // Refresh session in background if needed
  _maybeRefreshSession();
  return getCurrentUser();
}

/* ── Render user chip in sidebar ── */
function _renderUserChip() {
  const user = getCurrentUser();
  if (!user) return;

  _setAdminNavVisibility(user.role === "admin");
  _getUserProfile(user.id)
    .then((profile) => _setAdminNavVisibility(profile?.role === "admin"))
    .catch((err) => console.error("Unable to load account role", err));

  const footer = document.querySelector(".sidebar-footer");
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
        <div style="width:32px;height:32px;border-radius:50%;
          background:linear-gradient(135deg,#2563eb,#38bdf8);
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:700;color:#fff;flex-shrink:0">
          ${user.initials}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:#e2e8f0;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${_esc(user.name)}
          </div>
          <div style="font-size:11px;color:#64748b;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${_esc(user.email)}
          </div>
        </div>
        <button onclick="signOut()" title="Sign out"
          style="background:none;border:none;cursor:pointer;color:#64748b;
          padding:4px 6px;border-radius:6px;font-size:15px;line-height:1;
          transition:color .12s;flex-shrink:0"
          onmouseover="this.style.color='#f87171'"
          onmouseout="this.style.color='#64748b'">⏏</button>
      </div>`;
  }

  // Mobile topbar initials chip
  const topbar = document.querySelector(".app-topbar");
  if (topbar && !document.getElementById("topbarUserChip")) {
    const chip = document.createElement("div");
    chip.id = "topbarUserChip";
    chip.style.cssText =
      "display:flex;align-items:center;gap:8px;margin-right:4px";
    chip.innerHTML = `
      <div onclick="signOut()" title="Sign out"
        style="width:30px;height:30px;border-radius:50%;
        background:linear-gradient(135deg,#2563eb,#38bdf8);
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;color:#fff;cursor:pointer;flex-shrink:0">
        ${user.initials}
      </div>`;
    const ham = topbar.querySelector(".topbar-hamburger");
    if (ham) topbar.insertBefore(chip, ham);
    else topbar.appendChild(chip);
  }
}

function _esc(t) {
  return String(t || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ══════════════════════════════════════════
   SIGN OUT
══════════════════════════════════════════ */
async function signOut() {
  try {
    const sess = _getSession();
    if (sess && sess.access_token) {
      await fetch(`${_SB_AUTH_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: _SB_AUTH_KEY,
          Authorization: "Bearer " + sess.access_token,
        },
      });
    }
  } catch (e) {}
  localStorage.removeItem(_SESSION_KEY);
  // Clear data cache too
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("gss_cache_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  window.location.replace("login.html");
}

/* ══════════════════════════════════════════
   SESSION REFRESH
══════════════════════════════════════════ */
async function _maybeRefreshSession() {
  const sess = _getSession();
  if (!sess || !sess.refresh_token) return;
  const minsLeft = (sess.expires_at - Math.floor(Date.now() / 1000)) / 60;
  if (minsLeft > 15) return; // plenty of time

  try {
    const res = await fetch(
      `${_SB_AUTH_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { apikey: _SB_AUTH_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: sess.refresh_token }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      _saveSession(data);
    } else {
      // Token expired — redirect to login
      localStorage.removeItem(_SESSION_KEY);
      window.location.replace("login.html");
    }
  } catch (e) {}
}

// Auto-refresh check every 5 minutes
setInterval(_maybeRefreshSession, 5 * 60 * 1000);
