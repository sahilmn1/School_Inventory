/* ============================================================
   dashboard.js  —  GSS Inventory System
   Loads stats, category breakdown, recent items, movement count.
   ============================================================ */

async function loadDashboard() {
  showLoader();
  try {
    // SPEED: one request for items + categories, separate for logs
    const [allRes, logsRes] = await Promise.all([
      apiFetch('?action=getAll'),
      apiFetch('?action=getStockLog')
    ]);

    const items = (allRes  && allRes.items)      || [];
    const cats  = (allRes  && allRes.categories) || [];
    const logs  = (logsRes && logsRes.data)      || [];

    /* ── Stats ── */
    const locations = new Set(items.map(r => (r[8] || '').trim()).filter(Boolean));
    const now = new Date();
    const thisMonth = items.filter(r => {
      const ts = r[13]; // CreatedAt column index 13
      if (!ts) return false;
      const d = new Date(ts);
      return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    setText('dashTotalItems',      items.length);
    setText('dashTotalCategories', cats.length);
    setText('dashTotalLocations',  locations.size);
    setText('dashThisMonth',       thisMonth.length);
    setText('dashTotalMovements',  logs.length);

    /* ── Category breakdown ── */
    const catMap = {};
    cats.forEach(c => { catMap[c[0]] = c[1]; });

    const breakdown = {};
    items.forEach(r => {
      const key = r[1] || 'Unknown';
      breakdown[key] = (breakdown[key] || 0) + 1;
    });

    const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    const tbody = document.getElementById('catBreakdownBody');
    if (tbody) {
      if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--clr-muted)">No items yet. <a href="add.html">Add one →</a></td></tr>`;
      } else {
        tbody.innerHTML = sorted.map(([id, count]) => {
          const name = catMap[id] || id;
          const pct  = ((count / items.length) * 100).toFixed(0);
          return `
            <tr>
              <td style="font-weight:500">${escapeHtml(name)}</td>
              <td style="text-align:right;font-weight:700">${count}</td>
              <td style="text-align:right">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                  <div style="width:80px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:var(--clr-primary);border-radius:99px"></div>
                  </div>
                  <span style="font-size:12px;color:var(--clr-muted);min-width:28px">${pct}%</span>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    /* ── Recent items (last 6) ── */
    const recentEl = document.getElementById('dashRecent');
    if (recentEl) {
      const recent = items.slice().reverse().slice(0, 6);
      if (!recent.length) {
        recentEl.innerHTML = `<li style="color:var(--clr-muted);font-size:14px">No items yet.</li>`;
      } else {
        recentEl.innerHTML = recent.map(r => `
          <li>
            <span class="recent-dot"></span>
            <div>
              <div class="recent-name">${escapeHtml(r[3] || 'Unnamed')}</div>
              <div class="recent-meta">${escapeHtml(r[4] || '')}${r[8] ? ' · ' + escapeHtml(r[8]) : ''}</div>
            </div>
          </li>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Dashboard load failed', err);
    showToast('Failed to load dashboard data', 4000, 'error');
  } finally {
    hideLoader();
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}