/* ============================================================
   script.js  —  GSS Inventory System
   Handles: Add/Edit item form, Items list, Search/Filter,
   Pagination, PDF Export, Delete, Stock In/Out movements.
   Requires: common.js to be loaded first.
   ============================================================ */

/* ── Global state ── */
let selectedImageFile = null;
let editingId   = null;
let editingItem = null;

const PAGE_SIZE = 20;
let allItems      = [];
let deletedItems  = [];
let filteredItems = [];
let currentPage   = 1;
let allCategories = [];
let allSubCats    = [];

let _selectMode     = false;
let _selectedIds    = new Set();

/* ══════════════════════════════════════════
   ADD / EDIT PAGE
══════════════════════════════════════════ */

function initAddPage() {
  if (!document.getElementById('submitBtn')) return;

  loadCategoriesDropdown();
  bindImageInputs();

  // Check if we're editing (URL param ?id=...)
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    setTimeout(() => loadItemForEdit(id), 350);
  }
}

/* Load categories + sub-cats into the dropdowns on add.html */
async function loadCategoriesDropdown() {
  const sel = document.getElementById('category');
  if (!sel) return;
  showLoader();
  try {
    // SPEED: one request instead of two
    const res = await apiFetch('?action=getAll');
    allCategories = (res && res.categories) || [];
    allSubCats    = (res && res.subCategories) || [];

    sel.innerHTML = '<option value="">Select category…</option>';
    allCategories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c[0];
      opt.textContent = c[1];
      sel.appendChild(opt);
    });

    sel.addEventListener('change', () => refreshSubCategoryDropdown(sel.value));
  } catch (err) {
    console.error('Failed to load categories', err);
  } finally {
    hideLoader();
  }
}

function refreshSubCategoryDropdown(parentId, selectedSubId) {
  const subSel = document.getElementById('subCategory');
  if (!subSel) return;

  const subs = allSubCats.filter(s => s[1] === parentId);

  if (!subs.length) {
    subSel.innerHTML = '<option value="">No sub-categories</option>';
    subSel.disabled = true;
    return;
  }

  subSel.disabled = false;
  subSel.innerHTML = '<option value="">Select sub-category…</option>';
  subs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s[0];
    opt.textContent = s[2];
    if (selectedSubId && s[0] === selectedSubId) opt.selected = true;
    subSel.appendChild(opt);
  });
}

/* Bind camera + gallery file inputs */
function bindImageInputs() {
  ['cameraInput', 'galleryInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', handleImageSelected);
  });
}

function handleImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const originalKB = Math.round(file.size / 1024);
  if (originalKB > 800) showToast('Compressing image…', 1500, 'info');

  // 150KB target, 1280px max side — keeps uploads fast over slow connections
  compressImage(file, 150, 1280)
    .then(blob => {
      const name = (file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg';
      selectedImageFile = new File([blob], name, { type: 'image/jpeg' });
      showImagePreview(URL.createObjectURL(blob));

      const finalKB = Math.round(blob.size / 1024);
      const savedPct = originalKB > 0 ? Math.round((1 - finalKB / originalKB) * 100) : 0;
      showToast(
        savedPct > 0 ? `Image ready (${finalKB}KB, ${savedPct}% smaller)` : `Image ready (${finalKB}KB)`,
        1800, 'success'
      );
    })
    .catch(() => {
      selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = ev => showImagePreview(ev.target.result);
      reader.readAsDataURL(file);
      showToast('Could not compress — uploading original size', 2500, 'info');
    });
}

function showImagePreview(src) {
  const preview = document.getElementById('preview');
  const clearBtn = document.getElementById('clearImgBtn');
  const uploadArea = document.getElementById('uploadArea');
  if (preview) {
    preview.src = src;
    preview.style.display = 'block';
  }
  if (clearBtn)   clearBtn.style.display = '';
  if (uploadArea) uploadArea.style.display = 'none';
}

function clearImageSelection() {
  selectedImageFile = null;
  // Mark image as cleared on the item row (editingItem is an array; index 10 is ImageURL)
  if (editingItem) editingItem[10] = '';

  const preview    = document.getElementById('preview');
  const clearBtn   = document.getElementById('clearImgBtn');
  const uploadArea = document.getElementById('uploadArea');
  if (preview)    { preview.src = ''; preview.style.display = 'none'; }
  if (clearBtn)   clearBtn.style.display = 'none';
  if (uploadArea) uploadArea.style.display = '';

  ['cameraInput','galleryInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ── Load item into form for editing ── */
async function loadItemForEdit(id) {
  showLoader();
  try {
    let row = (allItems || []).find(r => r[0] === id);
    if (!row) {
      const d  = await apiFetch('?action=getItems');
      allItems = (d && d.data) || [];
      row      = allItems.find(r => r[0] === id);
    }
    if (!row) { showToast('Item not found', 3000, 'error'); return; }

    editingId   = id;
    editingItem = row;

    // Set hidden values
    setVal('category',    row[1]);
    setVal('subCategory', row[2]);
    setVal('itemName',    row[3]);
    setVal('brand',       row[4]);
    setVal('model',       row[5]);
    setVal('unit',        row[6]);
    setVal('condition',   row[7] || 'Working');
    setVal('itemLocation',row[8]);
    setVal('barcode',     row[9]);
    setVal('notes',       row[11] || '');
    setVal('stockQty',    row[12] || 0);

    // Populate autocomplete visible inputs
    const catInput = document.getElementById('categoryInput');
    const subInput = document.getElementById('subCategoryInput');
    if (catInput) {
      const cat = (window._acCategories || allCategories || []).find(c => c[0] === row[1]);
      catInput.value = cat ? cat[1] : row[1];
      if (typeof _acCategoryId !== 'undefined') window._acCategoryId = row[1];
    }
    if (subInput && row[2]) {
      const sub = (window._acSubCats || allSubCats || []).find(s => s[0] === row[2]);
      subInput.value    = sub ? sub[2] : row[2];
      subInput.disabled = false;
    }
    refreshSubCategoryDropdown(row[1], row[2]);

    if (row[10]) {
      const thumb = driveThumbnail(row[10], 300) || row[10];
      showImagePreview(thumb);
    }

    const title = document.getElementById('formTitle');
    const label = document.getElementById('breadcrumbLabel');
    const btn   = document.getElementById('submitBtnLabel');
    if (title) title.textContent = 'Edit Item';
    if (label) label.textContent = 'Edit Item';
    if (btn)   btn.textContent   = 'Update Item';

    // Hide stock qty field on edit (use stock movement instead)
    const stockQtyGroup = document.getElementById('stockQtyGroup');
    if (stockQtyGroup) {
      stockQtyGroup.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to load item for edit', err);
    showToast('Failed to load item', 3000, 'error');
  } finally {
    hideLoader();
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/* ── Save (Add or Update) ── */
async function saveItem() {
  const name     = getVal('itemName');
  const category = getVal('category');

  if (!category) { showToast('Please select a category', 3000, 'error'); return; }
  if (!name)     { showToast('Item name is required', 3000, 'error'); return; }

  setLoaderMsg(editingId ? 'Updating item…' : 'Saving item…');
  showLoader();

  try {
    let imgUrl = '';
    let clearImage = false;

    if (selectedImageFile) {
      // New image chosen — upload it
      setLoaderMsg('Uploading image…');
      imgUrl = await uploadImage(selectedImageFile);
    } else if (editingId) {
      // Editing: check if image was cleared or keep existing
      if (editingItem && editingItem[10] === '') {
        clearImage = true; // user explicitly cleared it
      }
      // imgUrl stays '' — GAS will keep the existing image (unless clearImage=true)
    }

    const body = new URLSearchParams({
      category,
      subCategory: getVal('subCategory') || '',
      name,
      brand:       getVal('brand'),
      model:       getVal('model'),
      unit:        getVal('unit'),
      condition:   getVal('condition') || 'Working',
      location:    getVal('itemLocation'),
      barcode:     getVal('barcode'),
      notes:       getVal('notes'),
      stockQty:    getVal('stockQty') || '0'
    });

    // Only send image URL when we have a new one
    if (imgUrl) body.append('image', imgUrl);
    if (clearImage) body.append('clearImage', 'true');
    if (editingId) body.append('id', editingId);

    const action = editingId ? 'updateItem' : 'addItem';

    const data = await apiFetch(`?action=${action}`, { method: 'POST', body });

    if (!data.success) throw new Error(data.error || 'Server returned an error');

    clearApiCache();

    if (editingId) {
      // When editing — go back to items list after update
      showToast('Item updated successfully', 3000, 'success');
      resetForm();
      editingId   = null;
      editingItem = null;
      setTimeout(() => { window.location.href = 'items.html'; }, 800);
    } else {
      // When adding — stay on page, reset form, ready for next item
      showToast('✅ Item added! Form cleared — add another item or go to View Items.', 4000, 'success');
      resetForm();
      // Scroll back to top of form smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Focus the category dropdown ready for next entry
      setTimeout(() => { const el = document.getElementById('category'); if (el) el.focus(); }, 300);
    }
  } catch (err) {
    console.error('Save item failed', err);
    showToast('Failed to save item: ' + err.message, 5000, 'error');
  } finally {
    hideLoader();
  }
}

/* ── Upload image to Google Drive via Apps Script ──
   Only image upload still uses GAS — all other data goes to Firebase.
── */
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const name   = file.name || 'photo.jpg';
      const type   = file.type || 'image/jpeg';

      // Include PIN in URL so GAS auth check passes
      const pin = typeof getStoredPin === 'function' ? getStoredPin() : '';
      const uploadUrl = GAS_IMAGE_URL + '?action=uploadImage' + (pin ? '&pin=' + encodeURIComponent(pin) : '');

      fetch(uploadUrl, {
        method:   'POST',
        redirect: 'follow',
        body:     JSON.stringify({ image: base64, name, type })
      })
        .then(r => r.text())   // read as text first — GAS sometimes returns HTML on error
        .then(text => {
          // Check if it's valid JSON
          if (!text || text.trimStart().startsWith('<')) {
            // GAS returned an HTML page — likely a redirect to login or an error page
            throw new Error(
              'Image upload failed — Google Apps Script returned an HTML page. ' +
              'Please check your Code.gs is deployed correctly (Deploy → Manage Deployments → ' +
              'make sure "Who has access" is set to "Anyone").'
            );
          }
          let d;
          try { d = JSON.parse(text); }
          catch(e) { throw new Error('Invalid response from image upload: ' + text.slice(0, 100)); }
          if (!d.success) throw new Error(d.error || 'Image upload failed');
          resolve(d.url || '');
        })
        .catch(reject);
    };
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  ['category','subCategory','itemName','brand','model','unit','itemLocation','barcode','notes','stockQty'].forEach(id => setVal(id, ''));
  setVal('condition', 'Working');
  clearImageSelection();
  editingId   = null;
  editingItem = null;

  // Clear autocomplete visible inputs if on add page
  ['categoryInput','subCategoryInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.disabled = id === 'subCategoryInput'; }
  });
  if (document.getElementById('subCategoryInput'))
    document.getElementById('subCategoryInput').placeholder = 'Select category first…';
  document.querySelectorAll('.ac-dropdown').forEach(d => d.classList.remove('open'));

  const title = document.getElementById('formTitle');
  const label = document.getElementById('breadcrumbLabel');
  const btn   = document.getElementById('submitBtnLabel');
  if (title) title.textContent = 'Add Inventory Item';
  if (label) label.textContent = 'Add Item';
  if (btn)   btn.textContent   = 'Add Item';
  const stockQtyGroup = document.getElementById('stockQtyGroup');
  if (stockQtyGroup) stockQtyGroup.style.display = '';
}

/* ══════════════════════════════════════════
   ITEMS LIST PAGE
══════════════════════════════════════════ */

async function initItemsPage() {
  if (!document.getElementById('itemsTableBody') && !document.getElementById('itemsCardView')) return;
  await loadItems();
}

async function loadItems() {
  setLoaderMsg('Loading items…');
  showLoader();
  try {
    // SPEED: one request instead of three
    const res = await apiFetch('?action=getAll');
    const allItemsRaw = (res && res.items) || [];
    // Deleted column is index 15 — can be true, 'TRUE', or 'true' depending on sheet format
    const isDeleted = r => {
      const v = r[15];
      return v === true || v === 'TRUE' || v === 'true';
    };
    allItems     = allItemsRaw.filter(r => !isDeleted(r));
    deletedItems = allItemsRaw.filter(r => isDeleted(r));
    allCategories = (res && res.categories)    || [];
    allSubCats    = (res && res.subCategories) || [];

    populateFilterDropdowns();
    filteredItems = [...allItems];
    renderPage(1);
  } catch (err) {
    console.error('Load items failed', err);
    showToast('Failed to load items', 4000, 'error');
  } finally {
    hideLoader();
  }
}

function populateFilterDropdowns() {
  // Category filter
  const catSel = document.getElementById('categoryFilter');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">All Categories</option>';
    allCategories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c[0];
      opt.textContent = c[1];
      if (c[0] === cur) opt.selected = true;
      catSel.appendChild(opt);
    });
  }

  // Location filter
  const locSel = document.getElementById('locationFilter');
  if (locSel) {
    const cur = locSel.value;
    const locs = [...new Set(allItems.map(r => (r[8] || '').trim()).filter(Boolean))].sort();
    locSel.innerHTML = '<option value="">All Locations</option>';
    locs.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      if (l === cur) opt.selected = true;
      locSel.appendChild(opt);
    });
  }
}

function searchItems() {
  const q        = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const catId    = document.getElementById('categoryFilter')?.value || '';
  const location = document.getElementById('locationFilter')?.value || '';

  filteredItems = allItems.filter(r => {
    const matchCat = !catId    || r[1] === catId;
    const matchLoc = !location || (r[8] || '') === location;
    const matchQ   = !q
      || (r[3] || '').toLowerCase().includes(q)
      || (r[4] || '').toLowerCase().includes(q)
      || (r[5] || '').toLowerCase().includes(q)
      || (r[8] || '').toLowerCase().includes(q)
      || (r[9] || '').toLowerCase().includes(q);
    return matchCat && matchLoc && matchQ;
  });

  _selectedIds.clear();
  renderPage(1);
  updateSummaryBar();
}

/* ══════════════════════════════════
   SUMMARY BAR
   Shows total qty + breakdown per unit
   for ALL filtered search results
══════════════════════════════════ */
function updateSummaryBar() {
  const bar       = document.getElementById('summaryBar');
  const allDiv    = document.getElementById('summaryAll');
  const breakdown = document.getElementById('summaryBreakdown');
  if (!bar) return;

  if (!filteredItems.length) { bar.style.display = 'none'; return; }
  bar.style.display = '';

  const totalQty  = filteredItems.reduce((s, r) => s + (Number(r[12]) || 0), 0);
  const itemCount = filteredItems.length;

  if (allDiv) allDiv.innerHTML =
    `📊 <strong>${itemCount}</strong> Location${itemCount !== 1 ? 's' : ''} &nbsp;·&nbsp; Total Quantity: <strong>${totalQty}</strong>`;

  if (breakdown) breakdown.innerHTML = '';

  updateSelectionSummary();
}

function updateSelectionSummary() {
  const selDiv = document.getElementById('summarySelected');
  if (!selDiv) return;

  if (_selectedIds.size === 0) { selDiv.style.display = 'none'; return; }

  const rows    = filteredItems.filter(r => _selectedIds.has(r[0]));
  const selQty  = rows.reduce((s, r) => s + (Number(r[12]) || 0), 0);

  selDiv.style.display = '';
  selDiv.innerHTML = `✅ ${_selectedIds.size} selected → Total: <strong>${selQty}</strong>`;
}

/* ══════════════════════════════════
   SELECT MODE
══════════════════════════════════ */
function toggleSelectMode() {
  _selectMode = !_selectMode;
  _selectedIds.clear();

  const btn     = document.getElementById('selectModeBtn');
  const bar     = document.getElementById('selectBar');
  const thCheck = document.getElementById('checkboxTh');
  if (btn) { btn.style.background = _selectMode ? 'var(--blue)' : ''; btn.style.color = _selectMode ? '#fff' : ''; }
  if (bar) bar.style.display = _selectMode ? 'flex' : 'none';
  if (thCheck) thCheck.style.display = _selectMode ? '' : 'none';

  renderPage(currentPage);
  updateSummaryBar();
}

function toggleSelectAll(checked) {
  if (checked) filteredItems.forEach(r => _selectedIds.add(r[0]));
  else _selectedIds.clear();
  ['selectAllCheck','selectAllCheck2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = checked;
  });
  document.querySelectorAll('.row-check').forEach(cb => { cb.checked = checked; });
  updateSelectCount(); updateSelectionSummary();
}

function toggleRowSelect(id, checked) {
  if (checked) _selectedIds.add(id); else _selectedIds.delete(id);
  const allChecked = filteredItems.every(r => _selectedIds.has(r[0]));
  ['selectAllCheck','selectAllCheck2'].forEach(cid => {
    const el = document.getElementById(cid); if (el) el.checked = allChecked;
  });
  updateSelectCount(); updateSelectionSummary();
}

function clearSelection() {
  _selectedIds.clear();
  document.querySelectorAll('.row-check').forEach(cb => { cb.checked = false; });
  ['selectAllCheck','selectAllCheck2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = false;
  });
  updateSelectCount(); updateSelectionSummary();
}

function updateSelectCount() {
  const el = document.getElementById('selectCount');
  if (el) el.textContent = `${_selectedIds.size} selected`;
}

function renderPage(page) {
  currentPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  const slice = filteredItems.slice(start, end);

  const isMobile = window.innerWidth < 700;
  const tableWrapper  = document.getElementById('tableWrapper');
  const cardView      = document.getElementById('itemsCardView');
  const emptyState    = document.getElementById('emptyState');
  const infoEl        = document.getElementById('itemsInfo');

  if (!filteredItems.length) {
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardView)     cardView.style.display = 'none';
    if (emptyState)   emptyState.style.display = '';
    if (infoEl)       infoEl.textContent = '';
    buildPagination(1, 1);
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  // Build lookup maps
  const catMap = {};
  allCategories.forEach(c => { catMap[c[0]] = c[1]; });
  const subMap = {};
  allSubCats.forEach(s => { subMap[s[0]] = s[2]; });

  if (isMobile) {
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardView)     cardView.style.display = '';
    cardView.innerHTML = slice.map(r => buildItemCard(r, catMap, subMap)).join('');
  } else {
    if (tableWrapper) tableWrapper.style.display = '';
    if (cardView)     cardView.style.display = 'none';
    const tbody = document.getElementById('itemsTableBody');
    if (tbody) tbody.innerHTML = slice.map(r => buildItemRow(r, catMap, subMap)).join('');
  }

  const total = filteredItems.length;
  const showing = Math.min(end, total);
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${showing} of ${total} item${total !== 1 ? 's' : ''}`;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  buildPagination(page, totalPages);
  updateSummaryBar();
}

function conditionBadge(c) {
  const map = {
    'Working':      'badge-green',
    'Needs Repair': 'badge-amber',
    'Faulty':       'badge-red',
    'Retired':      'badge-gray'
  };
  return `<span class="badge ${map[c] || 'badge-gray'}">${escapeHtml(c || 'Working')}</span>`;
}

function buildItemRow(r, catMap, subMap) {
  const thumb    = r[10] ? driveThumbnail(r[10], 80) : '';
  const catName  = catMap[r[1]] || r[1] || '—';
  const subName  = subMap[r[2]] || '';
  const qty      = parseInt(r[12] || 0, 10);
  const isChecked = _selectedIds.has(r[0]);
  const qtyBadge = qty === 0
    ? `<span class="badge badge-red">0 (Empty)</span>`
    : qty <= 3
    ? `<span class="badge badge-amber">${qty}</span>`
    : `<span class="badge badge-green">${qty}</span>`;

  const checkTd = _selectMode
    ? `<td style="width:36px;padding:0 8px">
         <input type="checkbox" class="row-check" style="width:15px;height:15px;cursor:pointer"
           ${isChecked?'checked':''} onchange="toggleRowSelect('${r[0]}',this.checked)" />
       </td>`
    : '';

  return `
    <tr style="${isChecked ? 'background:#eff6ff' : ''}">
      ${checkTd}
      <td>
        ${thumb
          ? `<img class="img-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(r[3]||'')}" loading="lazy" onclick="viewImage('${escapeHtml(driveThumbnail(r[10],800))}','${escapeHtml(r[3]||'')}')">`
          : `<div class="img-placeholder">📦</div>`}
      </td>
      <td>
        <div style="font-weight:600;cursor:pointer;color:var(--blue)" onclick="openItemDetail('${r[0]}')">${escapeHtml(r[3] || '')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">
          ${escapeHtml(catName)}${subName ? ' › ' + escapeHtml(subName) : ''}
        </div>
      </td>
      <td>${escapeHtml(r[4] || '')}</td>
      <td style="font-size:13px">${escapeHtml(r[5] || '')}</td>
      <td>${escapeHtml(r[6] || '')}</td>
      <td>${conditionBadge(r[7])}</td>
      <td>${qtyBadge}</td>
      <td style="font-size:13px">${escapeHtml(r[8] || '')}</td>
      <td style="font-family:monospace;font-size:12px">${escapeHtml(r[9] || '')}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline-primary" onclick="startEdit('${r[0]}')">✏️</button>
          <button class="btn btn-sm btn-success" style="padding:6px 8px" onclick="openStockModal('${r[0]}','${escapeHtml((r[3]||'').replace(/'/g,"\\'"))}',${parseInt(r[12]||0)},'${escapeHtml((r[8]||'').replace(/'/g,"\\'"))}')">📦</button>
          <button class="btn btn-sm btn-danger" onclick="openDeleteModal('${r[0]}','${escapeHtml((r[3]||'').replace(/'/g,"\\'"))}')">🗑️</button>
        </div>
      </td>
    </tr>
  `;
}

function buildItemCard(r, catMap, subMap) {
  const thumb = r[10] ? driveThumbnail(r[10], 120) : '';
  const catName = catMap[r[1]] || r[1] || '—';
  const subName = subMap[r[2]] || '';
  const qty = parseInt(r[12] || 0, 10);
  return `
    <div class="item-card">
      ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(r[3]||'')}" style="width:100%;height:140px;object-fit:cover;border-radius:var(--radius-md);margin-bottom:10px" onclick="viewImage('${escapeHtml(driveThumbnail(r[10],800))}','${escapeHtml(r[3]||'')}')" loading="lazy">` : ''}
      <div style="font-weight:700;font-size:15px">${escapeHtml(r[3] || 'Unnamed')}</div>
      <div style="font-size:12px;color:var(--clr-muted);margin:2px 0">
        ${escapeHtml(catName)}${subName ? ' › ' + escapeHtml(subName) : ''}
      </div>
      <div style="font-size:13px;color:var(--clr-muted);margin:4px 0">${escapeHtml(r[4]||'')} ${r[5] ? '· ' + escapeHtml(r[5]) : ''}</div>
      <div style="display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap">
        ${conditionBadge(r[7])}
        <span class="badge ${qty === 0 ? 'badge-red' : qty <= 3 ? 'badge-amber' : 'badge-green'}">Qty: ${qty}</span>
      </div>
      <div style="font-size:12px;margin:4px 0">📍 ${escapeHtml(r[8]||'—')}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm btn-outline-primary" style="flex:1" onclick="startEdit('${r[0]}')">✏️ Edit</button>
        <button class="btn btn-sm btn-success" onclick="openStockModal('${r[0]}','${escapeHtml((r[3]||'').replace(/'/g,"\\'"))}',${qty},'${escapeHtml((r[8]||'').replace(/'/g,"\\'"))}')">📦</button>
        <button class="btn btn-sm btn-danger" onclick="openDeleteModal('${r[0]}','${escapeHtml((r[3]||'').replace(/'/g,"\\'"))}')">🗑️</button>
      </div>
    </div>
  `;
}

/* ── Pagination ── */
function buildPagination(page, totalPages) {
  const ul = document.getElementById('pagination');
  if (!ul) return;
  ul.innerHTML = '';

  function addItem(num, label, active, disabled) {
    const li = document.createElement('li');
    li.className = 'page-item' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
    const a = document.createElement('a');
    a.className = 'page-link';
    a.href = '#';
    a.textContent = label;
    a.onclick = e => { e.preventDefault(); if (!disabled && !active) renderPage(num); };
    li.appendChild(a);
    ul.appendChild(li);
  }

  addItem(page - 1, '←', false, page === 1);
  const range = 5;
  let s = Math.max(1, page - Math.floor(range / 2));
  let e = Math.min(totalPages, s + range - 1);
  if (e - s + 1 < range) s = Math.max(1, e - range + 1);
  if (s > 1) { addItem(1, '1', false, false); if (s > 2) addItem(0, '…', false, true); }
  for (let p = s; p <= e; p++) addItem(p, p, p === page, false);
  if (e < totalPages) { if (e < totalPages - 1) addItem(0, '…', false, true); addItem(totalPages, totalPages, false, false); }
  addItem(page + 1, '→', false, page === totalPages);
}

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => renderPage(currentPage), 150);
});

/* ── Image viewer ── */
function viewImage(src, name) {
  const modal = document.getElementById('imageModal');
  const img   = document.getElementById('imageModalImg');
  if (modal && img) { img.src = src; img.alt = name || ''; modal.classList.add('open'); }
}

function startEdit(id) {
  window.location.href = `add.html?id=${encodeURIComponent(id)}`;
}

function openDeleteModal(id, name) {
  const modal = document.getElementById('confirmModal');
  const label = document.getElementById('deleteItemName');
  const btn   = document.getElementById('confirmDeleteBtn');
  if (label) label.textContent = name || id;
  if (btn)   btn.onclick = () => deleteItem(id);
  if (modal) modal.classList.add('open');
}

async function deleteItem(id) {
  closeModal('confirmModal');
  setLoaderMsg('Deleting item…');
  showLoader();
  try {
    const data = await apiFetch('?action=deleteItem', { method: 'POST', body: new URLSearchParams({ id }) });
    if (!data.success) throw new Error(data.error || 'Delete failed');
    clearApiCache();
    showToast('Item deleted', 3000, 'success');
    await loadItems();
  } catch (err) {
    console.error('Delete failed', err);
    showToast('Failed to delete item', 4000, 'error');
  } finally {
    hideLoader();
  }
}

/* ════════════════════════════════════════════
   TRASH — view & restore soft-deleted items
════════════════════════════════════════════ */

function openTrashModal() {
  const catMap = {};
  allCategories.forEach(c => { catMap[c[0]] = c[1]; });

  const modal = document.getElementById('trashModal');
  const body  = document.getElementById('trashModalBody');
  if (!modal || !body) return;

  if (!deletedItems.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--clr-muted)">
        <div style="font-size:40px;margin-bottom:12px">🗑️</div>
        <div style="font-weight:600;margin-bottom:6px">Trash is empty</div>
        <div style="font-size:13px">Deleted items appear here for 90 days before being permanently removed.</div>
      </div>`;
  } else {
    body.innerHTML = `
      <p style="font-size:13px;color:var(--clr-muted);margin-bottom:16px">
        ${deletedItems.length} deleted item${deletedItems.length !== 1 ? 's' : ''}.
        Items here can be restored within 90 days of deletion.
      </p>
      <table class="inv-table" style="width:100%">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Category</th>
            <th>Location</th>
            <th style="text-align:right">Action</th>
          </tr>
        </thead>
        <tbody>
          ${deletedItems.map(r => `
            <tr>
              <td>
                <div style="font-weight:600">${escapeHtml(r[3] || '—')}</div>
                <div style="font-size:11px;color:var(--clr-muted);font-family:monospace">${escapeHtml(r[0])}</div>
              </td>
              <td style="font-size:13px;color:var(--clr-muted)">${escapeHtml(catMap[r[1]] || r[1] || '—')}</td>
              <td style="font-size:13px;color:var(--clr-muted)">${escapeHtml(r[8] || '—')}</td>
              <td style="text-align:right">
                <button class="btn btn-sm btn-outline-primary" onclick="restoreItem('${escapeHtml(r[0])}','${escapeHtml((r[3]||'').replace(/'/g,"\\'"))}')">
                  ♻️ Restore
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  modal.classList.add('open');
}

async function restoreItem(id, name) {
  if (!confirm(`Restore "${name}" back to your active inventory?`)) return;
  showLoader();
  try {
    const data = await apiFetch('?action=restoreItem', { method: 'POST', body: new URLSearchParams({ id }) });
    if (!data.success) throw new Error(data.error || 'Restore failed');
    clearApiCache();
    closeModal('trashModal');
    showToast(`"${name}" restored successfully`, 3000, 'success');
    await loadItems();
    // Re-open trash modal if there are still deleted items
    if (deletedItems.length) openTrashModal();
  } catch (err) {
    console.error('Restore failed', err);
    showToast('Failed to restore item: ' + err.message, 4000, 'error');
  } finally {
    hideLoader();
  }
}

/* ════════════════════════════════════════════
   STOCK MOVEMENT MODAL
════════════════════════════════════════════ */
let _stockItemId = null;

/* ══════════════════════════════════════════
   ITEM DETAIL MODAL
   Click item name → see initial stock,
   current stock, full movement history
══════════════════════════════════════════ */
let _detailItemId = '';

async function openItemDetail(itemId) {
  _detailItemId = itemId;
  const item = allItems.find(r => r[0] === itemId);
  if (!item) return;

  // Populate header
  document.getElementById('detailItemName').textContent = item[3] || '—';
  document.getElementById('detailItemMeta').textContent =
    [item[4], item[5]].filter(Boolean).join(' · ') || 'No brand/model';

  // Current stock
  const currentQty = Number(item[12]) || 0;
  const curEl = document.getElementById('detailCurrentQty');
  if (curEl) {
    curEl.textContent = currentQty;
    curEl.style.color = currentQty === 0 ? 'var(--danger)' : 'var(--blue)';
  }

  // Location
  const locEl = document.getElementById('detailLocation');
  if (locEl) locEl.textContent = item[8] || '—';

  // Initial stock — find first IN movement from stock log
  document.getElementById('detailInitialQty').textContent = '…';
  document.getElementById('detailHistoryBody').innerHTML =
    '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>';
  document.getElementById('detailHistoryEmpty').style.display = 'none';

  openModal('itemDetailModal');

  try {
    const res  = await apiFetch('?action=getStockLog&itemId=' + encodeURIComponent(itemId));
    const logs = (res && res.data) || [];

    // Initial stock = first log entry's balance (oldest first)
    const sorted   = [...logs].reverse(); // logs come newest-first, reverse for oldest-first
    const firstLog = sorted[0];
    const initEl   = document.getElementById('detailInitialQty');
    if (initEl) {
      if (firstLog && firstLog[3] === 'IN') {
        // First movement was IN — initial qty is qty of that first IN
        initEl.textContent = firstLog[4] || 0;
      } else if (firstLog) {
        // Derive initial: work backwards from current + all OUTs - all INs
        let init = currentQty;
        logs.forEach(l => {
          if (l[3] === 'IN')  init -= (Number(l[4]) || 0);
          if (l[3] === 'OUT') init += (Number(l[4]) || 0);
        });
        initEl.textContent = Math.max(0, init);
      } else {
        initEl.textContent = currentQty; // no movements, initial = current
      }
    }

    // Render history table
    const tbody = document.getElementById('detailHistoryBody');
    const empty = document.getElementById('detailHistoryEmpty');

    if (!logs.length) {
      tbody.innerHTML = '';
      empty.style.display = '';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = logs.map(r => {
        const type    = r[3] || '';
        const qty     = Number(r[4]) || 0;
        const balance = Number(r[10]) || 0;
        const from    = r[5] || '';
        const to      = r[6] || '';
        const locStr  = (from && to && from !== to)
          ? `${escapeHtml(from)} → ${escapeHtml(to)}`
          : escapeHtml(from || to || '—');

        const typeBadge = type === 'IN'
          ? '<span class="badge badge-green">⬇ IN</span>'
          : type === 'OUT'
          ? '<span class="badge badge-red">⬆ OUT</span>'
          : '<span class="badge badge-purple">⇄ MOVE</span>';

        const balBadge = balance === 0
          ? `<span class="badge badge-red">${balance}</span>`
          : `<span class="badge badge-blue">${balance}</span>`;

        return `<tr>
          <td style="font-size:12px;white-space:nowrap;color:var(--muted)">${escapeHtml(formatTs(r[9]))}</td>
          <td>${typeBadge}</td>
          <td style="text-align:center;font-weight:700;font-size:15px">${qty}</td>
          <td style="font-size:12px">${locStr}</td>
          <td style="font-size:12.5px;color:var(--muted)">${escapeHtml(r[7] || '—')}</td>
          <td style="text-align:center">${balBadge}</td>
        </tr>`;
      }).join('');
    }
  } catch (err) {
    console.error('Load item history failed', err);
    document.getElementById('detailHistoryBody').innerHTML =
      `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger)">Failed to load history</td></tr>`;
  }
}

function openStockFromDetail() {
  closeModal('itemDetailModal');
  const item = allItems.find(r => r[0] === _detailItemId);
  if (item) openStockModal(item[0], item[3], Number(item[12]) || 0, item[8] || '');
}

function openStockModal(itemId, itemName, currentQty, currentLocation) {
  _stockItemId = itemId;

  // Find initial stock from item record
  const item = allItems.find(r => r[0] === itemId);

  document.getElementById('stockModalItemName').textContent = itemName;
  document.getElementById('stockCurrentQty').textContent   = currentQty;

  // Show initial qty if field exists
  const initEl = document.getElementById('stockInitialQty');
  if (initEl) initEl.textContent = currentQty; // will be updated async below

  // DEFAULT QTY TO 1 — most common movement is 1 unit
  document.getElementById('stockQtyInput').value     = '1';
  document.getElementById('stockReason').value       = '';
  document.getElementById('stockHandledBy').value    = '';
  document.getElementById('stockFromLocation').value = currentLocation || '';
  document.getElementById('stockToLocation').value   = currentLocation || '';

  const typeEl = document.getElementById('stockMovementType');
  if (typeEl) {
    typeEl.value = 'IN';
    toggleTransferFields('IN');
    typeEl.onchange = () => toggleTransferFields(typeEl.value);
  }

  openModal('stockModal');

  // Load initial stock from first log entry async
  apiFetch('?action=getStockLog&itemId=' + encodeURIComponent(itemId))
    .then(res => {
      const logs = (res && res.data) || [];
      if (initEl && logs.length) {
        const firstLog = [...logs].reverse()[0];
        if (firstLog && firstLog[3] === 'IN') {
          initEl.textContent = firstLog[4] || 0;
        } else {
          let init = currentQty;
          logs.forEach(l => {
            if (l[3] === 'IN')  init -= (Number(l[4]) || 0);
            if (l[3] === 'OUT') init += (Number(l[4]) || 0);
          });
          initEl.textContent = Math.max(0, init);
        }
      } else if (initEl) {
        initEl.textContent = currentQty;
      }
    }).catch(() => { if (initEl) initEl.textContent = '—'; });
}

function toggleTransferFields(type) {
  const transferRow = document.getElementById('transferLocationRow');
  const toLocLabel  = document.getElementById('toLocationLabel');
  if (transferRow) {
    transferRow.style.display = type === 'TRANSFER' ? '' : 'none';
  }
  if (toLocLabel) {
    toLocLabel.textContent = type === 'TRANSFER' ? 'New Location' : 'Location';
  }
}

async function saveStockMovement() {
  const type     = document.getElementById('stockMovementType')?.value || 'IN';
  const qty      = parseInt(document.getElementById('stockQtyInput')?.value || 0, 10);
  const reason   = document.getElementById('stockReason')?.value?.trim() || '';
  const handler  = document.getElementById('stockHandledBy')?.value?.trim() || '';
  const fromLoc  = document.getElementById('stockFromLocation')?.value?.trim() || '';
  const toLoc    = document.getElementById('stockToLocation')?.value?.trim() || '';

  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 3000, 'error'); return; }

  closeModal('stockModal');
  setLoaderMsg('Recording movement…');
  showLoader();

  try {
    const body = new URLSearchParams({
      itemId:       _stockItemId,
      movementType: type,
      quantity:     qty,
      fromLocation: fromLoc,
      toLocation:   toLoc,
      reason,
      handledBy:    handler
    });

    const data = await apiFetch('?action=stockMovement', { method: 'POST', body });

    if (!data.success) throw new Error(data.error || 'Unknown error');

    clearApiCache();
    const msg = data.message ||
      (type === 'TRANSFER'
        ? `Transfer recorded. ${data.transferred} moved, ${data.newQty} remain here.`
        : `Stock ${type} recorded. New balance: ${data.newQty}`);
    showToast(msg, 5000, 'success');
    await loadItems();
  } catch (err) {
    console.error('Stock movement failed', err);
    showToast('Failed: ' + err.message, 5000, 'error');
    hideLoader();
  }
}

/* ══════════════════════════════════════════
   PDF EXPORT — Items list
══════════════════════════════════════════ */
async function exportItemsListPDF() {
  const items = filteredItems.length ? filteredItems : allItems;
  if (!items.length) { showToast('No items to export', 2500, 'info'); return; }
  if (!confirm(`Export ${items.length} item(s) to PDF?`)) return;

  showLoader();
  setLoaderMsg('Generating PDF…');

  try {
    const jsPDFCtor = (window.jspdf || window.jsPDF || {}).jsPDF || window.jsPDF;
    if (!jsPDFCtor) { showToast('PDF library not loaded — please refresh the page', 4000, 'error'); return; }

    const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const PW  = doc.internal.pageSize.getWidth();
    const PH  = doc.internal.pageSize.getHeight();
    const M   = 12;

    const ROWS_PER_PAGE = 18;
    const ROW_H = 9;

    const catMap = {};
    allCategories.forEach(c => { catMap[c[0]] = c[1]; });
    const subMap = {};
    allSubCats.forEach(s => { subMap[s[0]] = s[2]; });

    const cols = [
      { label: '#',           w: 10, key: (r,i) => String(i+1) },
      { label: 'Item Name',   w: 48, key: r => r[3] || '' },
      { label: 'Category',    w: 30, key: r => catMap[r[1]] || r[1] || '' },
      { label: 'Sub-Cat',     w: 28, key: r => subMap[r[2]] || '' },
      { label: 'Brand',       w: 26, key: r => r[4] || '' },
      { label: 'Model',       w: 26, key: r => r[5] || '' },
      { label: 'Unit',        w: 16, key: r => r[6] || '' },
      { label: 'Qty',         w: 14, key: r => String(r[12] || 0) },
      { label: 'Condition',   w: 22, key: r => r[7] || '' },
      { label: 'Location',    w: 28, key: r => r[8] || '' },
      { label: 'Barcode',     w: 28, key: r => r[9] || '' },
    ];
    const tableW = cols.reduce((s,c) => s + c.w, 0);
    const tableX = M;
    let pageNum = 0;

    function drawPageHeader() {
      pageNum++;
      doc.setFillColor(29, 78, 216);
      doc.rect(0, 0, PW, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('GSS Inventory System — Inventory Report', M, 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString()}`, PW - M, 9, { align: 'right' });
      doc.setFillColor(241, 245, 249);
      doc.rect(0, 14, PW, 8, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.text(`Total items: ${items.length}`, M, 19.5);
      doc.text(`Page ${pageNum}`, PW - M, 19.5, { align: 'right' });
      doc.setFillColor(15, 23, 42);
      doc.rect(tableX, 22, tableW, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      let x = tableX;
      cols.forEach(col => {
        doc.text(col.label, x + 2, 27.5, { maxWidth: col.w - 3 });
        x += col.w;
      });
    }

    for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
      if (pageNum > 0) doc.addPage();
      drawPageHeader();
      const chunk = items.slice(i, i + ROWS_PER_PAGE);
      let y = 31;
      chunk.forEach((r, idx) => {
        const even = idx % 2 === 0;
        doc.setFillColor(even ? 255 : 248, even ? 255 : 250, even ? 255 : 252);
        doc.rect(tableX, y, tableW, ROW_H, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(tableX, y + ROW_H, tableX + tableW, y + ROW_H);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        let x = tableX;
        cols.forEach(col => {
          doc.text(String(col.key(r, i + idx) || ''), x + 2, y + 6, { maxWidth: col.w - 4 });
          x += col.w;
        });
        y += ROW_H;
      });
      doc.setDrawColor(226, 232, 240);
      let vx = tableX;
      cols.forEach(col => { doc.line(vx, 22, vx, y); vx += col.w; });
      doc.line(vx, 22, vx, y);
      doc.setFillColor(241, 245, 249);
      doc.rect(0, PH - 8, PW, 8, 'F');
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('GSS Inventory System — Confidential', M, PH - 3);
      doc.text(`Page ${pageNum}`, PW - M, PH - 3, { align: 'right' });
    }

    doc.save(`GSS_Inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast(`PDF exported — ${items.length} items`, 3000, 'success');
  } catch (err) {
    console.error('Export PDF failed:', err);
    showToast('PDF export failed', 5000, 'error');
  } finally {
    hideLoader();
  }
}