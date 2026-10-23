/**
 * Clinova Healthcare — UI Components
 * Shared UI logic for Data Tables, Modals, Toasts, and Formatters.
 */

/* ── FORMATTERS & BADGES ── */

export const Format = {
  date(iso) {
    if (!iso) return '-';
    // Use en-GB to get "28 Sep 2026" format reliably
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  datetime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
  },
  time(timeStr) {
    if (!timeStr) return '-';
    // timeStr is usually "HH:MM"
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute:'2-digit', hour12: true });
  },
  money(paise) {
    if (paise == null) return '-';
    return (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
  },
  age(dob) {
    if (!dob) return '-';
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  },
  displayName(name, role) {
    if (!name) return '';
    const trimmed = name.trim();
    if (role === 'DOCTOR') {
      if (!trimmed.toLowerCase().startsWith('dr.')) {
        return `Dr. ${trimmed}`;
      }
    }
    return trimmed;
  }
};

export const Badge = {
  status(status) {
    let color = 'neutral';
    switch (status) {
      // Appointments & Consults
      case 'COMPLETED': color = 'success'; break;
      case 'CHECKED_IN': case 'IN_PROGRESS': color = 'primary'; break;
      case 'CANCELLED': case 'NO_SHOW': color = 'danger'; break;
      case 'SCHEDULED': color = 'warning'; break;
      // Prescriptions / Lab
      case 'DISPENSED': color = 'success'; break;
      case 'PARTIALLY_DISPENSED': color = 'warning'; break;
      case 'PENDING': case 'ORDERED': color = 'warning'; break;
      case 'SAMPLE_COLLECTED': case 'PROCESSING': color = 'primary'; break;
      // Bills
      case 'PAID': color = 'success'; break;
      case 'UNPAID': color = 'danger'; break;
      case 'PARTIAL': color = 'warning'; break;
    }
    const label = status.replace(/_/g, ' ');
    return `<span class="badge badge--${color}">${label}</span>`;
  },
  payment(status) {
    return this.status(status);
  },
  priority(priority) {
    let color = 'neutral';
    if (priority === 'Urgent') color = 'warning';
    if (priority === 'Stat') color = 'danger';
    return `<span class="badge badge--${color}">${priority}</span>`;
  }
};

/* ── TOAST NOTIFICATIONS ── */

export const Toast = {
  show(message, type = 'success') {
    // type: success, error, info
    const container = document.getElementById('toast-container') || this._createContainer();
    const id = 'toast-' + Date.now();
    
    let icon = 'icon-info';
    if (type === 'success') icon = 'icon-check-circle';
    if (type === 'error') icon = 'icon-alert-circle';

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.id = id;
    toast.innerHTML = `
      <svg class="icon toast__icon" aria-hidden="true"><use href="../../assets/icons/sprite.svg#${icon}"></use></svg>
      <div class="toast__content">
        <div class="toast__message">${message}</div>
      </div>
      <button class="toast__close" aria-label="Close" onclick="document.getElementById('${id}').remove()">
        <svg class="icon" aria-hidden="true"><use href="../../assets/icons/sprite.svg#icon-x"></use></svg>
      </button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5s
    setTimeout(() => {
      if (document.getElementById(id)) {
        toast.style.animation = 'slideOutRight 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  },

  _createContainer() {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
    return div;
  }
};

/* ── MODALS ── */

export const Modal = {
  /**
   * Show a generic modal.
   * @param {Object} options { title, content (HTML string or Node), size ('sm'|'md'|'lg'), actions (HTML string or Node) }
   * @returns {Object} { close: function }
   */
  show({ title, content, size = 'md', actions = '' }) {
    const id = 'modal-' + Date.now();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay is-open';
    overlay.id = id;

    const contentHtml = typeof content === 'string' ? content : '';
    const actionsHtml = typeof actions === 'string' ? actions : '';

    overlay.innerHTML = `
      <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="modal__header">
          <h2 class="modal__title" id="${id}-title">${title}</h2>
          <button class="modal__close" aria-label="Close modal" id="${id}-close">
            <svg class="icon" aria-hidden="true"><use href="../../assets/icons/sprite.svg#icon-x"></use></svg>
          </button>
        </div>
        <div class="modal__body" id="${id}-body">
          ${contentHtml}
        </div>
        ${actionsHtml || typeof actions !== 'string' ? `<div class="modal__footer" id="${id}-footer">${actionsHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    
    if (typeof content !== 'string') document.getElementById(`${id}-body`).appendChild(content);
    if (typeof actions !== 'string' && actions) document.getElementById(`${id}-footer`).appendChild(actions);

    const closeFn = () => overlay.remove();
    document.getElementById(`${id}-close`).addEventListener('click', closeFn);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeFn();
    });

    return { close: closeFn, id };
  },

  /**
   * Show a confirmation modal.
   * @param {Object} options { title, message, confirmText, confirmStyle ('primary'|'danger'), onConfirm }
   */
  confirm({ title, message, confirmText = 'Confirm', confirmStyle = 'primary', onConfirm }) {
    const content = `<p class="text-body">${message}</p>`;
    const actions = `
      <button class="btn btn--secondary" id="confirm-cancel">Cancel</button>
      <button class="btn btn--${confirmStyle}" id="confirm-ok">${confirmText}</button>
    `;
    const m = this.show({ title, content, size: 'sm', actions });
    
    document.getElementById('confirm-cancel').addEventListener('click', m.close);
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      document.getElementById('confirm-ok').disabled = true;
      try {
        await onConfirm();
        m.close();
      } catch (err) {
        document.getElementById('confirm-ok').disabled = false;
        Toast.show(err.message, 'error');
      }
    });
  }
};

/* ── DATA TABLE ── */

/**
 * A lightweight client-side DataTable with search, sort, and pagination.
 * Responsive: Uses specific CSS to turn into stacked cards below 640px.
 */
export class DataTable {
  /**
   * @param {string} containerId - ID of DOM element
   * @param {Array} columns - [{ key, label, sortable, render(row), width }]
   * @param {Array} data - Array of row objects
   * @param {Object} options - { searchInputId, perPage, defaultSort }
   */
  constructor(containerId, columns, data, options = {}) {
    this.container = document.getElementById(containerId);
    this.columns = columns;
    this.originalData = data;
    this.data = [...data];
    
    this.perPage = options.perPage || 10;
    this.currentPage = 1;
    this.sortKey = options.defaultSort || null;
    this.sortAsc = true;
    
    this.searchInputId = options.searchInputId;
    this.emptyTitle = options.emptyTitle || 'No results found';
    this.emptyIcon = options.emptyIcon || 'icon-search';
    this.emptyAction = options.emptyAction || null; // HTML string for action button
    this.isLoading = options.isLoading !== false; // default true for initial render

    if (this.searchInputId) {
      const searchInput = document.getElementById(this.searchInputId);
      if (searchInput) {
        searchInput.addEventListener('input', (e) => this.search(e.target.value));
      }
    }

    if (this.sortKey) this._sortData();
    
    // Simulate initial loading skeleton then render actual
    this.render();
    if (this.isLoading) {
      setTimeout(() => {
        this.isLoading = false;
        this.render();
      }, 500); // 500ms skeleton
    }
  }

  updateData(newData) {
    this.originalData = newData;
    this.data = [...newData];
    if (this.sortKey) this._sortData();
    this.currentPage = 1;
    this.isLoading = false;
    this.render();
  }

  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.data = [...this.originalData];
    } else {
      this.data = this.originalData.filter(row => {
        // Search across all text rendered by columns
        return this.columns.some(col => {
          const val = col.render ? col.render(row) : row[col.key];
          // Strip HTML tags if render returned HTML
          const text = String(val).replace(/<[^>]+>/g, '').toLowerCase();
          return text.includes(q);
        });
      });
    }
    if (this.sortKey) this._sortData();
    this.currentPage = 1;
    this.render();
  }

  sortBy(key) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }
    this._sortData();
    this.render();
  }

  _sortData() {
    if (!this.sortKey) return;
    this.data.sort((a, b) => {
      let valA = a[this.sortKey];
      let valB = b[this.sortKey];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });
  }

  render() {
    if (!this.container) return;
    
    if (this.isLoading) {
      // Skeleton loader
      let html = `<div class="table-container"><table class="data-table"><thead><tr>`;
      for (const col of this.columns) html += `<th ${col.width ? `style="width:${col.width}"` : ''}>${col.label}</th>`;
      html += `</tr></thead><tbody>`;
      const widths = [40, 65, 50, 75, 60];
      for (let i = 0; i < Math.min(this.perPage, 5); i++) {
        html += `<tr>`;
        let j = 0;
        for (const col of this.columns) {
          const w = widths[(i + j) % widths.length];
          html += `<td><div class="skeleton" style="height: 20px; width: ${w}%; border-radius: 4px; background: var(--hover-bg);"></div></td>`;
          j++;
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
      this.container.innerHTML = html;
      return;
    }

    if (this.data.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg class="icon icon--lg" aria-hidden="true"><use href="../../assets/icons/sprite.svg#${this.emptyIcon}"></use></svg>
          </div>
          <div class="empty-state__title">${this.emptyTitle}</div>
          ${this.emptyAction ? `<div style="margin-top:var(--sp-4);">${this.emptyAction}</div>` : ''}
        </div>
      `;
      return;
    }

    const totalPages = Math.ceil(this.data.length / this.perPage);
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    
    const start = (this.currentPage - 1) * this.perPage;
    const paginated = this.data.slice(start, start + this.perPage);

    let html = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
    `;

    // Headers
    for (const col of this.columns) {
      let thClass = col.sortable ? 'table__sortable' : '';
      let thStyle = col.width ? `style="width:${col.width}"` : '';
      let sortIcon = '';
      
      if (col.sortable) {
        if (this.sortKey === col.key) {
          thClass += ' is-sorted';
          sortIcon = `<svg class="icon icon--sm table__sort-icon" aria-hidden="true"><use href="../../assets/icons/sprite.svg#icon-chevron-${this.sortAsc ? 'up' : 'down'}"></use></svg>`;
        } else {
          sortIcon = `<svg class="icon icon--sm table__sort-icon" style="opacity:0" aria-hidden="true"><use href="../../assets/icons/sprite.svg#icon-chevron-down"></use></svg>`;
        }
      }

      html += `<th class="${thClass}" ${thStyle} ${col.sortable ? `data-sort="${col.key}"` : ''}>
        <div style="display:flex;align-items:center;gap:4px;">
          ${col.label} ${sortIcon}
        </div>
      </th>`;
    }

    html += `</tr></thead><tbody>`;

    // Rows
    for (const row of paginated) {
      html += `<tr>`;
      for (const col of this.columns) {
        try {
          const val = col.render ? col.render(row) : row[col.key];
          // responsive data-label for stacked cards
          html += `<td data-label="${col.label}">${val == null ? '-' : val}</td>`;
        } catch (err) {
          console.warn(`Error rendering cell for row id ${row.id}`, err);
          html += `<td data-label="${col.label}">—</td>`;
        }
      }
      html += `</tr>`;
    }

    html += `</tbody></table>`;

    // Pagination
    if (totalPages > 1) {
      html += `
        <div class="table-pagination">
          <span class="text-caption">Showing ${start + 1} to ${Math.min(start + this.perPage, this.data.length)} of ${this.data.length} &bull; Page ${this.currentPage} of ${totalPages}</span>
          <div class="table-pagination__controls">
            <button class="btn btn--secondary btn--sm" id="${this.container.id}-prev" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
            <button class="btn btn--secondary btn--sm" id="${this.container.id}-next" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      `;
    }

    html += `</div>`; // Close .table-container

    this.container.innerHTML = html;

    // Attach Sort Handlers
    this.container.querySelectorAll('th.table__sortable').forEach(th => {
      th.addEventListener('click', () => this.sortBy(th.dataset.sort));
    });

    // Attach Pagination Handlers
    const prevBtn = document.getElementById(`${this.container.id}-prev`);
    const nextBtn = document.getElementById(`${this.container.id}-next`);
    if (prevBtn) prevBtn.addEventListener('click', () => { this.currentPage--; this.render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { this.currentPage++; this.render(); });
  }
}
