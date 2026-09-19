/* ============================================================
   common.js — GSS Inventory System
   Backend: Supabase PostgreSQL
   Auth: Supabase email/password (via auth.js)
   ============================================================ */

const SUPABASE_URL = "https://wlyrejxbbxyjocfrwfyk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndseXJlanhiYnh5am9jZnJ3ZnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTIxOTIsImV4cCI6MjEwNDE2ODE5Mn0.38q1she-z0NcdWYgs5nPtOq1T73dFMkK1gJyPDzDQp0";
const GAS_IMAGE_URL =
  "https://script.google.com/macros/s/AKfycbxna3vQdNeGLoB059uQ-4G-mlVtDEgOH1_b7OEMxzuGkWTcxKtFEtCecGOvYTfMqyYS4w/exec";

/* ══════════════════════════════════════════
   SUPABASE REST HELPERS
══════════════════════════════════════════ */
const _SB = SUPABASE_URL + "/rest/v1";

function _getSBHeaders() {
  // Use auth token from session if auth.js is loaded
  try {
    if (typeof getAuthHeaders === "function") return getAuthHeaders();
  } catch (e) {}
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function sbSelect(table, query) {
  const url = `${_SB}/${table}` + (query ? "?" + query : "");
  const res = await fetch(url, { headers: _getSBHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Read failed");
  return Array.isArray(data) ? data : [];
}

async function sbInsert(table, obj) {
  const res = await fetch(`${_SB}/${table}`, {
    method: "POST",
    headers: _getSBHeaders(),
    body: JSON.stringify(obj),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Insert failed");
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(table, match, obj) {
  const q = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`${_SB}/${table}?${q}`, {
    method: "PATCH",
    headers: _getSBHeaders(),
    body: JSON.stringify(obj),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Update failed");
  return Array.isArray(data) ? data[0] : data;
}

async function sbDeleteRow(table, match) {
  const q = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const hdrs = { ..._getSBHeaders(), Prefer: "return=minimal" };
  const res = await fetch(`${_SB}/${table}?${q}`, {
    method: "DELETE",
    headers: hdrs,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => {});
    throw new Error((d && d.message) || "Delete failed");
  }
  return true;
}

/* ══════════════════════════════════════════
   DATA CONVERTERS
   Supabase objects → arrays (app uses arrays)
   [0]id [1]catId [2]subCatId [3]name [4]brand
   [5]model [6]unit [7]condition [8]location
   [9]barcode [10]imageUrl [11]notes [12]stockQty
   [13]createdAt [14]updatedAt [15]deleted
══════════════════════════════════════════ */
function itemToArray(d) {
  return [
    d.id || "",
    d.category_id || "",
    d.sub_category_id || "",
    d.name || "",
    d.brand || "",
    d.model || "",
    d.unit || "",
    d.condition || "Working",
    d.location || "",
    d.barcode || "",
    d.image_url || "",
    d.notes || "",
    Number(d.stock_qty) || 0,
    d.created_at || "",
    d.updated_at || "",
    d.deleted === true,
  ];
}
function categoryToArray(d) {
  return [
    d.id || "",
    d.name || "",
    d.description || "",
    d.created_at || "",
    d.deleted || false,
  ];
}
function subCatToArray(d) {
  return [
    d.id || "",
    d.parent_id || "",
    d.name || "",
    d.description || "",
    d.created_at || "",
    d.deleted || false,
  ];
}
function stockLogToArray(d) {
  return [
    d.id || "",
    d.item_id || "",
    d.item_name || "",
    d.movement_type || "",
    Number(d.quantity) || 0,
    d.from_location || "",
    d.to_location || "",
    d.reason || "",
    d.handled_by || "",
    d.created_at || "",
    Number(d.balance_after) || 0,
  ];
}
function auditLogToArray(d) {
  return [
    d.id || "",
    d.created_at || "",
    d.action || "",
    d.entity_type || "",
    d.entity_id || "",
    d.entity_name || "",
    d.handled_by || "",
    d.details || "",
  ];
}

/* ══════════════════════════════════════════
   IN-MEMORY STORE — 0 reads after first load
══════════════════════════════════════════ */
const _store = {
  data: null,
  loaded: false,
  set(res) {
    this.data = {
      items: [...(res.items || [])],
      categories: [...(res.categories || [])],
      subCategories: [...(res.subCategories || [])],
    };
    this.loaded = true;
  },
  get() {
    if (!this.loaded || !this.data) return null;
    return { success: true, ...this.data };
  },
  addItem(arr) {
    if (this.data) this.data.items.push(arr);
  },
  updateItemArr(id, arr) {
    if (!this.data) return;
    const i = this.data.items.findIndex((r) => r[0] === id);
    if (i !== -1) this.data.items[i] = arr;
  },
  setItemField(id, idx, v) {
    if (!this.data) return;
    const r = this.data.items.find((r) => r[0] === id);
    if (r) r[idx] = v;
  },
  deleteItem(id) {
    if (this.data) {
      const r = this.data.items.find((r) => r[0] === id);
      if (r) r[15] = true;
    }
  },
  restoreItem(id) {
    if (this.data) {
      const r = this.data.items.find((r) => r[0] === id);
      if (r) r[15] = false;
    }
  },
  addCat(arr) {
    if (this.data) this.data.categories.push(arr);
  },
  updateCat(id, n, d) {
    if (!this.data) return;
    const c = this.data.categories.find((c) => c[0] === id);
    if (c) {
      c[1] = n;
      c[2] = d;
    }
  },
  deleteCat(id) {
    if (!this.data) return;
    const i = this.data.categories.findIndex((c) => c[0] === id);
    if (i !== -1) this.data.categories.splice(i, 1);
  },
  addSub(arr) {
    if (this.data) this.data.subCategories.push(arr);
  },
  updateSub(id, n, d) {
    if (!this.data) return;
    const s = this.data.subCategories.find((s) => s[0] === id);
    if (s) {
      s[2] = n;
      s[3] = d;
    }
  },
  deleteSub(id) {
    if (!this.data) return;
    const i = this.data.subCategories.findIndex((s) => s[0] === id);
    if (i !== -1) this.data.subCategories.splice(i, 1);
  },
};

/* ══════════════════════════════════════════
   CACHE (24h localStorage)
══════════════════════════════════════════ */
const _CACHE_TTL_LONG = 24 * 60 * 60 * 1000;
const _CACHE_TTL_SHORT = 5 * 60 * 1000;
const _CACHE_PREFIX = "gss_cache_";
const _apiCache = {};
const _LONG_CACHE_ACTIONS = [
  "getAll",
  "getItems",
  "getCategories",
  "getSubCategories",
];

function _getTTL(a) {
  return _LONG_CACHE_ACTIONS.includes(a) ? _CACHE_TTL_LONG : _CACHE_TTL_SHORT;
}
function _cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(_CACHE_PREFIX + key);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < ttl) return data;
      localStorage.removeItem(_CACHE_PREFIX + key);
    }
  } catch (e) {}
  const h = _apiCache[key];
  return h && Date.now() - h.ts < ttl ? h.data : null;
}
function _cacheSet(key, data) {
  try {
    localStorage.setItem(
      _CACHE_PREFIX + key,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch (e) {}
  _apiCache[key] = { data, ts: Date.now() };
}
function clearApiCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(_CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  Object.keys(_apiCache).forEach((k) => delete _apiCache[k]);
}
function forceRefresh() {
  clearApiCache();
  _store.loaded = false;
  _store.data = null;
  window.location.reload();
}

/* ══════════════════════════════════════════
   AUTH — uses auth.js session
   Legacy PIN stubs kept for compatibility
══════════════════════════════════════════ */
function getStoredPin() {
  return "";
}
function setStoredPin() {}
function clearStoredPin() {}
function promptForPin() {}
function appendPinToUrl(u) {
  return u;
}

function _getCurrentUserEmail() {
  try {
    if (typeof getCurrentUser === "function") {
      const u = getCurrentUser();
      return u ? u.email : "";
    }
  } catch (e) {}
  return "";
}

async function ensurePinVerified() {
  // Check session from auth.js
  try {
    if (typeof _getSession === "function") {
      const sess = _getSession();
      if (!sess) {
        window.location.replace("login.html");
        return false;
      }
      return true;
    }
  } catch (e) {}
  return true; // fallback — allow through if auth.js not loaded yet
}

/* ══════════════════════════════════════════
   MAIN API ROUTER
══════════════════════════════════════════ */
async function apiFetch(url, options) {
  const action = (url.match(/[?&]action=([^&]+)/) || [])[1] || "";
  const isPost = options && options.method === "POST";
  const adminActions = new Set([
    "getAdminSettings",
    "saveAdminSettings",
    "runPurge",
    "getAuditLog",
  ]);

  if (adminActions.has(action) && typeof requireAdmin === "function") {
    const isAdmin = await requireAdmin();
    if (!isAdmin) {
      return { success: false, error: "Administrator access required" };
    }
  }

  let params = {};
  const qIdx = url.indexOf("?");
  if (qIdx !== -1) {
    url
      .slice(qIdx + 1)
      .split("&")
      .forEach((pair) => {
        const ei = pair.indexOf("=");
        if (ei !== -1) {
          const k = decodeURIComponent(pair.slice(0, ei)),
            v = decodeURIComponent(pair.slice(ei + 1));
          if (k !== "action") params[k] = v;
        }
      });
  }
  if (isPost && options.body) {
    if (options.body instanceof URLSearchParams) {
      for (const [k, v] of options.body.entries()) params[k] = v;
    } else if (typeof options.body === "string") {
      try {
        Object.assign(params, JSON.parse(options.body));
      } catch (e) {}
    }
  }

  // Serve getAll from _store (0 reads)
  if (!isPost && action === "getAll" && _store.loaded) return _store.get();

  // localStorage cache
  const cacheKey = url;
  const skipCache =
    (action === "getStockLog" && params.itemId) || action === "getAll";
  if (!isPost && !skipCache) {
    const cached = _cacheGet(cacheKey, _getTTL(action));
    if (cached) return cached;
  }

  if (!(await ensurePinVerified()))
    return { success: false, error: "Auth failed", authRequired: true };

  let result;
  try {
    switch (action) {
      case "getAll":
        result = await _getAll();
        break;
      case "getCategories":
        result = await _getCategories();
        break;
      case "addCategory":
        result = await _addCategory(params);
        break;
      case "updateCategory":
        result = await _updateCategory(params);
        break;
      case "deleteCategory":
        result = await _deleteCategory(params);
        break;
      case "getSubCategories":
        result = await _getSubCats(params);
        break;
      case "addSubCategory":
        result = await _addSubCat(params);
        break;
      case "updateSubCategory":
        result = await _updateSubCat(params);
        break;
      case "deleteSubCategory":
        result = await _deleteSubCat(params);
        break;
      case "getItems":
        result = await _getItems();
        break;
      case "addItem":
        result = await _addItem(params);
        break;
      case "updateItem":
        result = await _updateItem(params);
        break;
      case "deleteItem":
        result = await _deleteItem(params);
        break;
      case "restoreItem":
        result = await _restoreItem(params);
        break;
      case "stockMovement":
        result = await _stockMovement(params);
        break;
      case "getStockLog":
        result = await _getStockLog(params);
        break;
      case "getAuditLog":
        result = await _getAuditLog(params);
        break;
      case "getAdminSettings":
        result = await _getAdminSettings();
        break;
      case "saveAdminSettings":
        result = await _saveAdminSettings(params);
        break;
      case "runPurge":
        result = await _runPurge();
        break;
      case "runBackup":
        result = { success: true, message: "Supabase backs up automatically." };
        break;
      default:
        result = { success: false, error: "Unknown action: " + action };
    }
  } catch (err) {
    console.error("apiFetch [" + action + "]:", err);
    result = { success: false, error: err.message };
  }

  if (action === "getAll" && result && result.success) _store.set(result);
  if (!isPost && result && result.success !== false)
    _cacheSet(cacheKey, result);
  return result;
}

/* ══════════════════════════════════════════
   AUDIT
══════════════════════════════════════════ */
async function _audit(action, type, id, name, by, details) {
  try {
    await sbInsert("audit_log", {
      action,
      entity_type: type,
      entity_id: id || "",
      entity_name: name || "",
      handled_by: by || "",
      details: details || "",
    });
  } catch (e) {
    console.warn("Audit failed:", e.message);
  }
}

/* ══════════════════════════════════════════
   GET ALL
══════════════════════════════════════════ */
async function _getAll() {
  const [cats, subs, items] = await Promise.all([
    sbSelect("categories", "deleted=eq.false&order=name.asc"),
    sbSelect("sub_categories", "deleted=eq.false&order=name.asc"),
    sbSelect("items", "order=created_at.desc"),
  ]);
  return {
    success: true,
    categories: cats.map(categoryToArray),
    subCategories: subs.map(subCatToArray),
    items: items.map(itemToArray),
  };
}

/* ══════════════════════════════════════════
   CATEGORIES
══════════════════════════════════════════ */
async function _getCategories() {
  const rows = await sbSelect("categories", "deleted=eq.false&order=name.asc");
  return { success: true, data: rows.map(categoryToArray) };
}
async function _addCategory(p) {
  const name = (p.name || "").trim();
  if (!name) throw new Error("Name required");
  const user = _getCurrentUserEmail();
  const row = await sbInsert("categories", {
    name,
    description: p.description || "",
  });
  await _audit("CREATE", "Category", row.id, name, user);
  _store.addCat(categoryToArray(row));
  return { success: true, id: row.id };
}
async function _updateCategory(p) {
  if (!p.id) throw new Error("ID required");
  await sbUpdate(
    "categories",
    { id: p.id },
    { name: p.name || "", description: p.description || "" },
  );
  await _audit("UPDATE", "Category", p.id, p.name, _getCurrentUserEmail());
  _store.updateCat(p.id, p.name || "", p.description || "");
  return { success: true };
}
async function _deleteCategory(p) {
  if (!p.id) throw new Error("ID required");
  await sbUpdate("categories", { id: p.id }, { deleted: true });
  await _audit("DELETE", "Category", p.id, "", _getCurrentUserEmail());
  _store.deleteCat(p.id);
  return { success: true };
}

/* ══════════════════════════════════════════
   SUB-CATEGORIES
══════════════════════════════════════════ */
async function _getSubCats(p) {
  let q = "deleted=eq.false&order=name.asc";
  if (p && p.parentId) q += "&parent_id=eq." + encodeURIComponent(p.parentId);
  const rows = await sbSelect("sub_categories", q);
  return { success: true, data: rows.map(subCatToArray) };
}
async function _addSubCat(p) {
  const name = (p.name || "").trim();
  if (!name) throw new Error("Name required");
  if (!p.parentId) throw new Error("Parent ID required");
  const user = _getCurrentUserEmail();
  const row = await sbInsert("sub_categories", {
    name,
    parent_id: p.parentId,
    description: p.description || "",
  });
  await _audit("CREATE", "SubCategory", row.id, name, user);
  _store.addSub(subCatToArray(row));
  return { success: true, id: row.id };
}
async function _updateSubCat(p) {
  if (!p.id) throw new Error("ID required");
  await sbUpdate(
    "sub_categories",
    { id: p.id },
    { name: p.name || "", description: p.description || "" },
  );
  await _audit("UPDATE", "SubCategory", p.id, p.name, _getCurrentUserEmail());
  _store.updateSub(p.id, p.name || "", p.description || "");
  return { success: true };
}
async function _deleteSubCat(p) {
  if (!p.id) throw new Error("ID required");
  await sbUpdate("sub_categories", { id: p.id }, { deleted: true });
  await _audit("DELETE", "SubCategory", p.id, "", _getCurrentUserEmail());
  _store.deleteSub(p.id);
  return { success: true };
}

/* ══════════════════════════════════════════
   ITEMS
══════════════════════════════════════════ */
async function _getItems() {
  const rows = await sbSelect(
    "items",
    "deleted=eq.false&order=created_at.desc",
  );
  return { success: true, data: rows.map(itemToArray) };
}
async function _addItem(p) {
  const name = (p.name || "").trim();
  if (!name) throw new Error("Item name required");
  const qty = Math.max(0, parseInt(p.stockQty || 0, 10) || 0);
  const user = _getCurrentUserEmail();
  const row = await sbInsert("items", {
    category_id: p.category || null,
    sub_category_id: p.subCategory || null,
    name,
    brand: p.brand || "",
    model: p.model || "",
    unit: p.unit || "",
    condition: p.condition || "Working",
    location: p.location || "",
    barcode: p.barcode || "",
    image_url: p.image || "",
    notes: p.notes || "",
    stock_qty: qty,
    created_by: user,
    updated_by: user,
  });
  if (qty > 0)
    await _appendStockLog({
      itemId: row.id,
      itemName: name,
      movementType: "IN",
      quantity: qty,
      fromLocation: "",
      toLocation: p.location || "",
      reason: "Initial stock",
      handledBy: user,
      balanceAfter: qty,
    });
  await _audit("CREATE", "Item", row.id, name, user);
  _store.addItem(itemToArray(row));
  return { success: true, id: row.id };
}
async function _updateItem(p) {
  if (!p.id) throw new Error("ID required");
  const rows = await sbSelect("items", "id=eq." + encodeURIComponent(p.id));
  if (!rows.length) throw new Error("Item not found");
  const doc = rows[0];
  const user = _getCurrentUserEmail();
  const newImage =
    p.image && p.image.startsWith("https://")
      ? p.image
      : p.clearImage === "true"
        ? ""
        : doc.image_url || "";
  const now = new Date().toISOString();
  const fields = {
    category_id:
      p.category !== undefined ? p.category || null : doc.category_id,
    sub_category_id:
      p.subCategory !== undefined ? p.subCategory || null : doc.sub_category_id,
    name: p.name !== undefined ? p.name : doc.name,
    brand: p.brand !== undefined ? p.brand : doc.brand,
    model: p.model !== undefined ? p.model : doc.model,
    unit: p.unit !== undefined ? p.unit : doc.unit,
    condition: p.condition !== undefined ? p.condition : doc.condition,
    location: p.location !== undefined ? p.location : doc.location,
    barcode: p.barcode !== undefined ? p.barcode : doc.barcode,
    image_url: newImage,
    notes: p.notes !== undefined ? p.notes : doc.notes,
    updated_at: now,
    updated_by: user,
  };
  await sbUpdate("items", { id: p.id }, fields);
  await _audit("UPDATE", "Item", p.id, fields.name, user);
  _store.updateItemArr(p.id, itemToArray({ ...doc, ...fields, id: p.id }));
  return { success: true };
}
async function _deleteItem(p) {
  if (!p.id) throw new Error("ID required");
  const rows = await sbSelect("items", "id=eq." + encodeURIComponent(p.id));
  if (!rows.length) throw new Error("Item not found");
  const user = _getCurrentUserEmail();
  await sbUpdate(
    "items",
    { id: p.id },
    { deleted: true, updated_at: new Date().toISOString(), updated_by: user },
  );
  await _audit("DELETE", "Item", p.id, rows[0].name, user);
  _store.deleteItem(p.id);
  return { success: true };
}
async function _restoreItem(p) {
  if (!p.id) throw new Error("ID required");
  const rows = await sbSelect("items", "id=eq." + encodeURIComponent(p.id));
  if (!rows.length) throw new Error("Item not found");
  const user = _getCurrentUserEmail();
  await sbUpdate(
    "items",
    { id: p.id },
    { deleted: false, updated_at: new Date().toISOString(), updated_by: user },
  );
  await _audit("RESTORE", "Item", p.id, rows[0].name, user);
  _store.restoreItem(p.id);
  return { success: true };
}

/* ══════════════════════════════════════════
   STOCK MOVEMENTS
══════════════════════════════════════════ */
async function _stockMovement(p) {
  if (!p.itemId) throw new Error("Item ID required");
  const type = (p.movementType || "").toUpperCase();
  if (!["IN", "OUT", "TRANSFER"].includes(type))
    throw new Error("Invalid movement type");
  const qty = parseInt(p.quantity || 0, 10);
  if (qty <= 0) throw new Error("Quantity must be > 0");
  const rows = await sbSelect("items", "id=eq." + encodeURIComponent(p.itemId));
  if (!rows.length) throw new Error("Item not found");
  const doc = rows[0];
  const currentQty = Number(doc.stock_qty) || 0;
  const now = new Date().toISOString();
  const user = _getCurrentUserEmail();

  if (type === "IN") {
    const newQty = currentQty + qty;
    await sbUpdate(
      "items",
      { id: p.itemId },
      { stock_qty: newQty, updated_at: now, updated_by: user },
    );
    await _appendStockLog({
      itemId: p.itemId,
      itemName: doc.name,
      movementType: "IN",
      quantity: qty,
      fromLocation: p.fromLocation || doc.location || "",
      toLocation: doc.location || "",
      reason: p.reason || "",
      handledBy: user,
      balanceAfter: newQty,
    });
    _store.setItemField(p.itemId, 12, newQty);
    return { success: true, newQty };
  }
  if (type === "OUT") {
    if (qty > currentQty)
      throw new Error("Insufficient stock. Available: " + currentQty);
    const newQty = currentQty - qty;
    await sbUpdate(
      "items",
      { id: p.itemId },
      { stock_qty: newQty, updated_at: now, updated_by: user },
    );
    await _appendStockLog({
      itemId: p.itemId,
      itemName: doc.name,
      movementType: "OUT",
      quantity: qty,
      fromLocation: doc.location || "",
      toLocation: p.toLocation || doc.location || "",
      reason: p.reason || "",
      handledBy: user,
      balanceAfter: newQty,
    });
    _store.setItemField(p.itemId, 12, newQty);
    return { success: true, newQty };
  }
  if (type === "TRANSFER") {
    if (qty > currentQty)
      throw new Error("Cannot transfer more than available: " + currentQty);
    if (!p.toLocation) throw new Error("Destination location required");
    const fromLoc = (p.fromLocation || doc.location || "").trim();
    const toLoc = p.toLocation.trim();
    if (fromLoc.toLowerCase() === toLoc.toLowerCase())
      throw new Error("Source and destination are the same");
    const srcNewQty = currentQty - qty;
    const nameKey = (doc.name || "").toLowerCase().trim();
    const toLocKey = toLoc.toLowerCase().trim();

    // Check _store first (0 reads)
    let destDoc = null;
    if (_store.data && _store.data.items) {
      const f = _store.data.items.find(
        (r) =>
          r[0] !== p.itemId &&
          !r[15] &&
          (r[3] || "").toLowerCase().trim() === nameKey &&
          (r[8] || "").toLowerCase().trim() === toLocKey,
      );
      if (f) destDoc = { id: f[0], stock_qty: f[12] };
    }
    if (!destDoc) {
      const dr = await sbSelect(
        "items",
        "deleted=eq.false&name=ilike." +
          encodeURIComponent(doc.name) +
          "&location=ilike." +
          encodeURIComponent(toLoc),
      );
      destDoc = dr.find((r) => r.id !== p.itemId) || null;
    }

    if (qty === currentQty && !destDoc) {
      await sbUpdate(
        "items",
        { id: p.itemId },
        { location: toLoc, updated_at: now, updated_by: user },
      );
      await _appendStockLog({
        itemId: p.itemId,
        itemName: doc.name,
        movementType: "TRANSFER",
        quantity: qty,
        fromLocation: fromLoc,
        toLocation: toLoc,
        reason: p.reason || "",
        handledBy: user,
        balanceAfter: qty,
      });
      _store.setItemField(p.itemId, 8, toLoc);
      return {
        success: true,
        newQty: qty,
        transferred: qty,
        message: `All ${qty} moved to ${toLoc}`,
      };
    }

    if (srcNewQty === 0) {
      await sbUpdate(
        "items",
        { id: p.itemId },
        { stock_qty: 0, deleted: true, updated_at: now, updated_by: user },
      );
      _store.deleteItem(p.itemId);
    } else {
      await sbUpdate(
        "items",
        { id: p.itemId },
        { stock_qty: srcNewQty, updated_at: now, updated_by: user },
      );
      _store.setItemField(p.itemId, 12, srcNewQty);
    }

    let destId, destNewQty;
    if (destDoc) {
      destNewQty = (Number(destDoc.stock_qty) || 0) + qty;
      destId = destDoc.id;
      await sbUpdate(
        "items",
        { id: destId },
        { stock_qty: destNewQty, updated_at: now, updated_by: user },
      );
      _store.setItemField(destId, 12, destNewQty);
    } else {
      destNewQty = qty;
      const nr = await sbInsert("items", {
        category_id: doc.category_id || null,
        sub_category_id: doc.sub_category_id || null,
        name: doc.name || "",
        brand: doc.brand || "",
        model: doc.model || "",
        unit: doc.unit || "",
        condition: doc.condition || "Working",
        location: toLoc,
        barcode: doc.barcode || "",
        image_url: doc.image_url || "",
        notes: doc.notes || "",
        stock_qty: destNewQty,
        created_by: user,
        updated_by: user,
      });
      destId = nr.id;
      _store.addItem(itemToArray(nr));
    }

    await _appendStockLog({
      itemId: p.itemId,
      itemName: doc.name,
      movementType: "TRANSFER",
      quantity: qty,
      fromLocation: fromLoc,
      toLocation: toLoc,
      reason: p.reason || "",
      handledBy: user,
      balanceAfter: srcNewQty,
    });
    await _appendStockLog({
      itemId: destId,
      itemName: doc.name,
      movementType: "IN",
      quantity: qty,
      fromLocation: fromLoc,
      toLocation: toLoc,
      reason: (p.reason || "") + "(transfer from " + fromLoc + ")",
      handledBy: user,
      balanceAfter: destNewQty,
    });
    const rm =
      srcNewQty > 0
        ? `. ${srcNewQty} remain at ${fromLoc}`
        : `. ${fromLoc} entry removed`;
    return {
      success: true,
      newQty: srcNewQty,
      destQty: destNewQty,
      destId,
      transferred: qty,
      merged: !!destDoc,
      message: `${qty} moved to ${toLoc}${rm}`,
    };
  }
  return { success: false, error: "Unknown type" };
}

async function _appendStockLog(d) {
  try {
    await sbInsert("stock_log", {
      item_id: d.itemId,
      item_name: d.itemName,
      movement_type: d.movementType,
      quantity: d.quantity,
      from_location: d.fromLocation,
      to_location: d.toLocation,
      reason: d.reason,
      handled_by: d.handledBy,
      balance_after: d.balanceAfter,
    });
  } catch (e) {
    console.warn("Stock log failed:", e.message);
  }
}

async function _getStockLog(p) {
  let q = "order=created_at.desc&limit=500";
  if (p && p.itemId) q = "item_id=eq." + encodeURIComponent(p.itemId) + "&" + q;
  const rows = await sbSelect("stock_log", q);
  return { success: true, data: rows.map(stockLogToArray) };
}

/* ══════════════════════════════════════════
   AUDIT LOG
══════════════════════════════════════════ */
async function _getAuditLog(p) {
  let q = "order=created_at.desc&limit=500";
  if (p && p.entityType)
    q = "entity_type=eq." + encodeURIComponent(p.entityType) + "&" + q;
  const rows = await sbSelect("audit_log", q);
  return { success: true, data: rows.map(auditLogToArray) };
}

/* ══════════════════════════════════════════
   ADMIN
══════════════════════════════════════════ */
async function _getAdminSettings() {
  const [items, cats, logs, audits] = await Promise.all([
    sbSelect("items", "select=id,deleted"),
    sbSelect("categories", "select=id&deleted=eq.false"),
    sbSelect("stock_log", "select=id"),
    sbSelect("audit_log", "select=id"),
  ]);
  const deleted = items.filter((r) => r.deleted).length;
  return {
    success: true,
    folderName: "Google Drive (images)",
    hasFolderId: true,
    pinIsSet: true,
    totalItems: items.length - deleted,
    deletedItems: deleted,
    totalLogs: logs.length,
    totalAuditLogs: audits.length,
    ssName: "Supabase PostgreSQL — ap-south-1 (Mumbai)",
    isSupabase: true,
  };
}

async function _saveAdminSettings(p) {
  if (p.newPin) {
    const rows = await sbSelect("settings", "key=eq.pin");
    if (rows.length)
      await sbUpdate("settings", { key: "pin" }, { value: p.newPin });
    else await sbInsert("settings", { key: "pin", value: p.newPin });
    return { success: true, message: "PIN updated." };
  }
  if (p.action2 === "verifyPin" && p.testPin) {
    const rows = await sbSelect("settings", "key=eq.pin");
    return {
      success: true,
      pinMatches: rows.length ? rows[0].value === p.testPin : true,
    };
  }
  if (p.newFolderId) {
    try {
      sessionStorage.setItem("gss_folder_id", p.newFolderId.trim());
    } catch (e) {}
    return { success: true, message: "Folder ID saved." };
  }
  return { success: false, error: "No valid action" };
}

async function _runPurge() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const rows = await sbSelect(
    "items",
    "deleted=eq.true&updated_at=lt." + cutoff.toISOString() + "&select=id",
  );
  let count = 0;
  for (const r of rows) {
    try {
      await sbDeleteRow("items", { id: r.id });
      count++;
    } catch (e) {}
  }
  await _audit(
    "PURGE",
    "System",
    "ITEMS",
    "Purge",
    "",
    count + " items permanently removed",
  );
  clearApiCache();
  return {
    success: true,
    purgedCount: count,
    message: count + " item(s) permanently removed.",
  };
}

/* ══════════════════════════════════════════
   UI UTILITIES
══════════════════════════════════════════ */
function showLoader() {
  const el = document.getElementById("loader");
  if (el) el.style.display = "flex";
}
function hideLoader() {
  const el = document.getElementById("loader");
  if (el) el.style.display = "none";
}
function setLoaderMsg(msg) {
  const el = document.getElementById("loaderMsg");
  if (el) el.textContent = msg;
}

function showToast(message = "", duration = 3000, type = "info") {
  const c = document.getElementById("toastContainer");
  if (!c) {
    console.log("[Toast]", message);
    return;
  }
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const t = document.createElement("div");
  t.className = `toast-item toast-${type}`;
  t.innerHTML = `<span>${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add("toast-fade-out");
    setTimeout(() => t.remove(), 200);
  }, duration);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openSidebar() {
  const s = document.getElementById("appSidebar"),
    o = document.getElementById("sidebarOverlay");
  if (s) s.classList.add("open");
  if (o) o.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeSidebar() {
  const s = document.getElementById("appSidebar"),
    o = document.getElementById("sidebarOverlay");
  if (s) s.classList.remove("open");
  if (o) o.classList.remove("open");
  document.body.style.overflow = "";
}
function toggleDrawer() {
  const s = document.getElementById("appSidebar");
  if (s && s.classList.contains("open")) closeSidebar();
  else openSidebar();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
}

function getDriveFileId(url) {
  if (!url) return "";
  const m = url.match(/\/d\/([^\/\?]+)/);
  return m ? m[1] : "";
}
function driveThumbnail(url, size = 200) {
  const id = getDriveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : "";
}

function compressImage(file, targetKB = 150, maxDimension = 1280) {
  const targetBytes = targetKB * 1024;
  return new Promise((resolve, reject) => {
    if (file.size <= targetBytes && /jpe?g/i.test(file.type))
      return resolve(file);
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width,
          h = img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round(h * (maxDimension / w));
            w = maxDimension;
          } else {
            w = Math.round(w * (maxDimension / h));
            h = maxDimension;
          }
        }
        const canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d");
        let quality = 0.82;
        function attempt() {
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return fetch(canvas.toDataURL("image/jpeg", quality))
            .then((r) => r.blob())
            .then((blob) => {
              if (blob.size <= targetBytes || (w < 200 && h < 200))
                return resolve(blob);
              if (quality > 0.5) {
                quality -= 0.12;
                return attempt();
              }
              w = Math.round(w * 0.8);
              h = Math.round(h * 0.8);
              quality = 0.8;
              return attempt();
            });
        }
        attempt().catch(reject);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function movementBadge(type) {
  return (
    {
      IN: '<span class="badge badge-green">⬇ IN</span>',
      OUT: '<span class="badge badge-red">⬆ OUT</span>',
      TRANSFER: '<span class="badge badge-purple">⇄ TRANSFER</span>',
    }[type] || `<span class="badge badge-gray">${escapeHtml(type)}</span>`
  );
}

async function exportItemsPDF() {
  if (!confirm("Export all items to PDF?")) return;
  showLoader();
  try {
    const data = await apiFetch("?action=getItems");
    const items = (data && data.data) || [];
    if (!items.length) {
      showToast("No items", 2500, "info");
      return;
    }
    const jsPDF = (window.jspdf || window.jsPDF || {}).jsPDF;
    if (!jsPDF) {
      showToast("PDF library not loaded", 3000, "error");
      return;
    }
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 12,
      usableW = doc.internal.pageSize.getWidth() - margin * 2,
      usableH = doc.internal.pageSize.getHeight() - margin * 2;
    let page = 1;
    for (let i = 0; i < items.length; i += 15) {
      const chunk = items.slice(i, i + 15);
      const el = document.createElement("div");
      el.style.cssText =
        "width:780px;padding:16px;font-family:Arial,sans-serif;background:#fff;position:fixed;left:-9999px";
      el.innerHTML = `<div style="font-size:20px;font-weight:800;color:#1d4ed8;margin-bottom:12px">GSS Inventory — Page ${page}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#1d4ed8;color:#fff">
        <th style="padding:8px">Item</th><th style="padding:8px">Brand</th><th style="padding:8px">Qty</th><th style="padding:8px">Location</th></tr></thead><tbody>
        ${chunk
          .map(
            (
              r,
              idx,
            ) => `<tr style="background:${idx % 2 === 0 ? "#f8fafc" : "#fff"}">
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(r[3] || "")}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(r[4] || "")}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">${r[12] || 0}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(r[8] || "")}</td>
        </tr>`,
          )
          .join("")}</tbody></table>`;
      document.body.appendChild(el);
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fff",
      });
      document.body.removeChild(el);
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      let drawW = usableW,
        drawH = (canvas.height * drawW) / canvas.width;
      if (drawH > usableH) {
        drawH = usableH;
        drawW = (canvas.width * drawH) / canvas.height;
      }
      if (page > 1) doc.addPage();
      doc.addImage(imgData, "JPEG", margin, margin, drawW, drawH);
      page++;
    }
    doc.save(`GSS_Inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("PDF exported", 3000, "success");
  } catch (err) {
    showToast("PDF failed", 5000, "error");
  } finally {
    hideLoader();
  }
}

// Legacy compat
const API = SUPABASE_URL;
