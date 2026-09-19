/* ============================================================
   categories.js  —  GSS Inventory System
   CRUD for categories AND sub-categories.
   ============================================================ */

let _editingCatId    = null;
let _editingSubCatId = null;
let _allItems        = [];
let _allSubCats      = [];

async function loadCategoriesPage() {
  showLoader();
  try {
    // SPEED: one request instead of three
    const [allRes] = await Promise.all([
      apiFetch('?action=getAll')
    ]);

    const cats  = (allRes && allRes.categories)    || [];
    _allSubCats = (allRes && allRes.subCategories) || [];
    _allItems   = (allRes && allRes.items)         || [];

    renderCategoryTable(cats);
  } catch (err) {
    console.error('Failed to load categories', err);
    showToast('Failed to load categories', 4000, 'error');
  } finally {
    hideLoader();
  }
}

function renderCategoryTable(cats) {
  const tbody = document.getElementById('catTableBody');
  const empty = document.getElementById('catEmptyState');

  if (!cats.length) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Build item counts per category ID
  const counts = {};
  _allItems.forEach(r => {
    const key = r[1] || '';
    counts[key] = (counts[key] || 0) + 1;
  });

  // Build sub-cat counts per parent
  const subCounts = {};
  _allSubCats.forEach(s => {
    const key = s[1] || '';
    subCounts[key] = (subCounts[key] || 0) + 1;
  });

  tbody.innerHTML = cats.map(c => {
    const id      = c[0];
    const name    = c[1] || '';
    const desc    = c[2] || '';
    const cnt     = counts[id]   || 0;
    const subCnt  = subCounts[id] || 0;
    const mySubs  = _allSubCats.filter(s => s[1] === id);

    // Sub-category rows (collapsed by default)
    const subRows = mySubs.map(s => `
      <tr class="sub-cat-row" data-parent="${escapeHtml(id)}" style="display:none">
        <td style="padding-left:36px">
          <span style="color:var(--clr-muted);margin-right:6px">↳</span>
          <span style="font-size:13px">${escapeHtml(s[2])}</span>
        </td>
        <td style="font-size:13px;color:var(--clr-muted)">${escapeHtml(s[3]) || '<em style="color:#cbd5e1">—</em>'}</td>
        <td style="text-align:right">
          <span class="badge badge-gray">sub-category</span>
        </td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline-primary" onclick="openEditSubCatModal('${escapeHtml(s[0])}','${escapeHtml(s[1])}','${escapeHtml(s[2]).replace(/'/g,"\\'")}','${escapeHtml(s[3]).replace(/'/g,"\\'")}')">
              ✏️
            </button>
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteSubCat('${escapeHtml(s[0])}','${escapeHtml(s[2]).replace(/'/g,"\\'")}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    return `
      <tr class="cat-row" data-id="${escapeHtml(id)}">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            ${mySubs.length ? `
              <button class="toggle-sub-btn btn btn-sm btn-outline" style="padding:2px 7px;font-size:12px" 
                      onclick="toggleSubRows('${escapeHtml(id)}')" title="Toggle sub-categories">
                <span id="toggle-icon-${escapeHtml(id)}">▶</span>
              </button>
            ` : '<span style="width:28px;display:inline-block"></span>'}
            <strong>${escapeHtml(name)}</strong>
          </div>
        </td>
        <td style="color:var(--clr-muted)">${escapeHtml(desc) || '<em style="color:#cbd5e1">—</em>'}</td>
        <td style="text-align:right">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge badge-blue">${cnt} item${cnt !== 1 ? 's' : ''}</span>
            <span class="badge badge-purple">${subCnt} sub-cat${subCnt !== 1 ? 's' : ''}</span>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline-primary" onclick="openEditCategoryModal('${escapeHtml(id)}','${escapeHtml(name).replace(/'/g,"\\'")}','${escapeHtml(desc).replace(/'/g,"\\'")}')">
              ✏️ Edit
            </button>
            <button class="btn btn-sm btn-outline" style="border-color:#7c3aed;color:#7c3aed" onclick="openAddSubCatModal('${escapeHtml(id)}','${escapeHtml(name).replace(/'/g,"\\'")}')">
              + Sub
            </button>
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteCategory('${escapeHtml(id)}','${escapeHtml(name).replace(/'/g,"\\'")}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
      ${subRows}
    `;
  }).join('');
}

/* ── Toggle sub-category rows ── */
function toggleSubRows(parentId) {
  const rows = document.querySelectorAll(`.sub-cat-row[data-parent="${parentId}"]`);
  const icon = document.getElementById('toggle-icon-' + parentId);
  const isHidden = rows.length && rows[0].style.display === 'none';
  rows.forEach(r => { r.style.display = isHidden ? '' : 'none'; });
  if (icon) icon.textContent = isHidden ? '▼' : '▶';
}

/* ════════════════════════════════════════════
   CATEGORY MODALS
════════════════════════════════════════════ */
function openAddCategoryModal() {
  _editingCatId = null;
  document.getElementById('catModalTitle').textContent = 'Add Category';
  document.getElementById('catName').value = '';
  document.getElementById('catDesc').value = '';
  document.getElementById('catModalSaveBtn').textContent = 'Save Category';
  openModal('catModal');
}

function openEditCategoryModal(id, name, desc) {
  _editingCatId = id;
  document.getElementById('catModalTitle').textContent = 'Edit Category';
  document.getElementById('catName').value = name;
  document.getElementById('catDesc').value = desc;
  document.getElementById('catModalSaveBtn').textContent = 'Update Category';
  openModal('catModal');
}

async function saveCategory() {
  const name = (document.getElementById('catName').value || '').trim();
  if (!name) { showToast('Category name is required', 3000, 'error'); return; }
  const desc = (document.getElementById('catDesc').value || '').trim();

  showLoader();
  closeModal('catModal');

  try {
    const body = new URLSearchParams({ name, description: desc });
    if (_editingCatId) body.append('id', _editingCatId);
    const action = _editingCatId ? 'updateCategory' : 'addCategory';

    const data = await apiFetch(`?action=${action}`, { method: 'POST', body });
    if (!data.success) throw new Error(data.error || 'Server error');
    showToast(_editingCatId ? 'Category updated' : 'Category added', 3000, 'success');
    await loadCategoriesPage();
  } catch (err) {
    console.error('Save category failed', err);
    showToast('Failed to save category', 4000, 'error');
    hideLoader();
  }
}

function confirmDeleteCategory(id, name) {
  document.getElementById('catDeleteName').textContent = name;
  const btn = document.getElementById('catDeleteBtn');
  btn.onclick = () => deleteCategory(id);
  openModal('catDeleteModal');
}

async function deleteCategory(id) {
  closeModal('catDeleteModal');
  showLoader();
  try {
    const data = await apiFetch('?action=deleteCategory', { method: 'POST', body: new URLSearchParams({ id }) });
    if (!data.success) throw new Error(data.error || 'Delete failed');
    showToast('Category deleted', 3000, 'success');
    await loadCategoriesPage();
  } catch (err) {
    console.error('Delete category failed', err);
    showToast('Failed to delete category', 4000, 'error');
    hideLoader();
  }
}

/* ════════════════════════════════════════════
   SUB-CATEGORY MODALS
════════════════════════════════════════════ */
let _subCatParentId   = null;
let _subCatParentName = '';

function openAddSubCatModal(parentId, parentName) {
  _editingSubCatId  = null;
  _subCatParentId   = parentId;
  _subCatParentName = parentName;

  document.getElementById('subCatModalTitle').textContent = `Add Sub-Category under "${parentName}"`;
  document.getElementById('subCatName').value = '';
  document.getElementById('subCatDesc').value = '';
  document.getElementById('subCatModalSaveBtn').textContent = 'Save Sub-Category';
  openModal('subCatModal');
}

function openEditSubCatModal(id, parentId, name, desc) {
  _editingSubCatId = id;
  _subCatParentId  = parentId;

  document.getElementById('subCatModalTitle').textContent = 'Edit Sub-Category';
  document.getElementById('subCatName').value = name;
  document.getElementById('subCatDesc').value = desc;
  document.getElementById('subCatModalSaveBtn').textContent = 'Update Sub-Category';
  openModal('subCatModal');
}

async function saveSubCategory() {
  const name = (document.getElementById('subCatName').value || '').trim();
  if (!name) { showToast('Sub-category name is required', 3000, 'error'); return; }
  const desc = (document.getElementById('subCatDesc').value || '').trim();

  showLoader();
  closeModal('subCatModal');

  try {
    const body = new URLSearchParams({ name, description: desc, parentId: _subCatParentId });
    if (_editingSubCatId) body.append('id', _editingSubCatId);
    const action = _editingSubCatId ? 'updateSubCategory' : 'addSubCategory';

    const data2 = await apiFetch(`?action=${action}`, { method: 'POST', body });
    if (!data2.success) throw new Error(data2.error || 'Server error');
    showToast(_editingSubCatId ? 'Sub-category updated' : 'Sub-category added', 3000, 'success');
    await loadCategoriesPage();
    // Auto-expand the parent after adding
    if (!_editingSubCatId && _subCatParentId) {
      setTimeout(() => {
        const rows = document.querySelectorAll(`.sub-cat-row[data-parent="${_subCatParentId}"]`);
        const icon = document.getElementById('toggle-icon-' + _subCatParentId);
        rows.forEach(r => { r.style.display = ''; });
        if (icon) icon.textContent = '▼';
      }, 300);
    }
  } catch (err) {
    console.error('Save sub-category failed', err);
    showToast('Failed to save sub-category', 4000, 'error');
    hideLoader();
  }
}

function confirmDeleteSubCat(id, name) {
  if (!confirm(`Delete sub-category "${name}"? Items using it will lose their sub-category assignment.`)) return;
  deleteSubCategory(id);
}

async function deleteSubCategory(id) {
  showLoader();
  try {
    const data = await apiFetch('?action=deleteSubCategory', { method: 'POST', body: new URLSearchParams({ id }) });
    if (!data.success) throw new Error(data.error || 'Delete failed');
    showToast('Sub-category deleted', 3000, 'success');
    await loadCategoriesPage();
  } catch (err) {
    console.error('Delete sub-category failed', err);
    showToast('Failed to delete sub-category', 4000, 'error');
    hideLoader();
  }
}