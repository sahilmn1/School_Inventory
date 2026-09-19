/* ============================================================
   history.js  —  GSS Inventory System
   Stock movement history log page.
   ============================================================ */

const HISTORY_PAGE_SIZE = 30;
let _allLogs      = [];
let _filteredLogs = [];
let _historyPage  = 1;
let _allItemsMap  = {};

async function loadHistoryPage() {
  showLoader();
  try {
    const [logsRes, itemsRes] = await Promise.all([
      apiFetch('?action=getStockLog'),
      apiFetch('?action=getAll')
    ]);

    _allLogs = (logsRes && logsRes.data) || [];
    const items = (itemsRes && itemsRes.items) || [];
    _allItemsMap = {};
    items.forEach(r => { _allItemsMap[r[0]] = r[3] || ''; });

    populateHistoryItemFilter(items);
    _filteredLogs = [..._allLogs];
    renderHistoryPage(1);

  } catch (err) {
    console.error('Failed to load history', err);
    showToast('Failed to load history log', 4000, 'error');
  } finally {
    hideLoader();
  }
}

function populateHistoryItemFilter(items) {
  const sel = document.getElementById('historyItemFilter');
  if (!sel) return;
  sel.innerHTML = '<option value="">All Items</option>';
  items.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r[0];
    opt.textContent = r[3] || r[0];
    sel.appendChild(opt);
  });
}

function filterHistory() {
  const itemId = document.getElementById('historyItemFilter')?.value || '';
  const type   = document.getElementById('historyTypeFilter')?.value || '';
  const q      = (document.getElementById('historySearch')?.value || '').toLowerCase();

  _filteredLogs = _allLogs.filter(r => {
    // r: [ID(0) ItemID(1) ItemName(2) Type(3) Qty(4) From(5) To(6) Reason(7) HandledBy(8) Timestamp(9) Balance(10)]
    const matchItem = !itemId || r[1] === itemId;
    const matchType = !type   || r[3] === type;
    const matchQ    = !q
      || (r[2] || '').toLowerCase().includes(q)
      || (r[7] || '').toLowerCase().includes(q)
      || (r[8] || '').toLowerCase().includes(q)
      || (r[5] || '').toLowerCase().includes(q)
      || (r[6] || '').toLowerCase().includes(q);
    return matchItem && matchType && matchQ;
  });

  renderHistoryPage(1);
}

function renderHistoryPage(page) {
  _historyPage = page;
  const start = (page - 1) * HISTORY_PAGE_SIZE;
  const end   = start + HISTORY_PAGE_SIZE;
  const slice = _filteredLogs.slice(start, end);

  const tbody    = document.getElementById('historyTableBody');
  const emptyEl  = document.getElementById('historyEmptyState');
  const infoEl   = document.getElementById('historyInfo');

  if (!_filteredLogs.length) {
    if (tbody)   tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    if (infoEl)  infoEl.textContent = '';
    buildHistoryPagination(1, 1);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  if (tbody) {
    tbody.innerHTML = slice.map(r => {
      const type = r[3] || '';
      return `
        <tr>
          <td style="font-size:12px;white-space:nowrap;color:var(--clr-muted)">${escapeHtml(formatTs(r[9]))}</td>
          <td>
            <div style="font-weight:600">${escapeHtml(r[2] || '—')}</div>
            <div style="font-size:11px;color:var(--clr-muted);font-family:monospace">${escapeHtml(r[1] || '')}</div>
          </td>
          <td>${movementBadge(type)}</td>
          <td style="font-weight:700;font-size:15px;text-align:center">${escapeHtml(String(r[4] || 0))}</td>
          <td>
            ${r[5] ? `<div style="font-size:12px">From: <strong>${escapeHtml(r[5])}</strong></div>` : ''}
            ${r[6] ? `<div style="font-size:12px">To: <strong>${escapeHtml(r[6])}</strong></div>` : ''}
          </td>
          <td style="font-size:13px;color:var(--clr-muted)">${escapeHtml(r[7] || '—')}</td>
          <td style="font-size:13px">${escapeHtml(r[8] || '—')}</td>
          <td style="font-weight:700;text-align:center">
            <span class="badge ${parseInt(r[10]||0) === 0 ? 'badge-red' : 'badge-blue'}">${escapeHtml(String(r[10] || 0))}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  const total = _filteredLogs.length;
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${Math.min(end, total)} of ${total} log${total !== 1 ? 's' : ''}`;
  buildHistoryPagination(page, Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)));
}

function buildHistoryPagination(page, totalPages) {
  const ul = document.getElementById('historyPagination');
  if (!ul) return;
  ul.innerHTML = '';

  function addItem(num, label, active, disabled) {
    const li = document.createElement('li');
    li.className = 'page-item' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
    const a = document.createElement('a');
    a.className = 'page-link';
    a.href = '#';
    a.textContent = label;
    a.onclick = e => { e.preventDefault(); if (!disabled && !active) renderHistoryPage(num); };
    li.appendChild(a);
    ul.appendChild(li);
  }

  addItem(page - 1, '←', false, page === 1);
  for (let p = 1; p <= totalPages; p++) addItem(p, p, p === page, false);
  addItem(page + 1, '→', false, page === totalPages);
}