// Expense & Budget Visualizer — Application Logic

// ─── Constants ───────────────────────────────────────────────────────────────

const BUILTIN_CATEGORIES = ['Food', 'Transport', 'Fun'];

const MAX_ITEM_NAME_LENGTH      = 100;
const MAX_AMOUNT                = 999_999_999.99;
const MIN_AMOUNT                = 0.01;
const MAX_CUSTOM_CAT_NAME_LENGTH = 50;
const MAX_CUSTOM_CATEGORIES     = 50;
const MAX_RENDERED_TRANSACTIONS = 500;

// Alert color used when a category has exceeded its spending limit
const ALERT_COLOR = '#e74c3c';

// Deterministic color palette — ≥ 53 unique hex strings to cover
// 3 built-in categories + up to 50 custom categories.
const CATEGORY_COLORS = [
  '#3498db', // blue
  '#2ecc71', // green
  '#9b59b6', // purple
  '#f39c12', // orange
  '#1abc9c', // teal
  '#e67e22', // dark orange
  '#2980b9', // darker blue
  '#27ae60', // darker green
  '#8e44ad', // darker purple
  '#d35400', // burnt orange
  '#16a085', // darker teal
  '#f1c40f', // yellow
  '#c0392b', // dark red
  '#2c3e50', // navy
  '#7f8c8d', // grey
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#4caf50', // material green
  '#ff5722', // deep orange
  '#607d8b', // blue-grey
  '#9c27b0', // material purple
  '#ff9800', // material orange
  '#795548', // brown
  '#673ab7', // deep purple
  '#3f51b5', // indigo
  '#009688', // material teal
  '#8bc34a', // light green
  '#cddc39', // lime
  '#ffc107', // amber
  '#ff5252', // red accent
  '#40c4ff', // light blue accent
  '#69f0ae', // green accent
  '#ea80fc', // purple accent
  '#ffab40', // orange accent
  '#b2ff59', // light green accent
  '#84ffff', // cyan accent
  '#80d8ff', // light blue lighter
  '#a7ffeb', // teal accent
  '#ccff90', // light green lighter
  '#ffe57f', // amber lighter
  '#ff6e40', // deep orange accent
  '#d500f9', // purple A700
  '#00b0ff', // light blue A400
  '#1de9b6', // teal A400
  '#76ff03', // light green A400
  '#c6ff00', // lime A400
  '#ffea00', // yellow A400
  '#ff6d00', // orange A700
  '#dd2c00', // deep orange A700
  '#aa00ff', // purple A700 variant
  '#304ffe', // indigo A700
  '#00b8d4', // cyan A700
  '#00bfa5', // teal A700
];

// ─── Application State ────────────────────────────────────────────────────────

/**
 * Single source of truth for all in-memory application state.
 * Every mutation writes to localStorage first, then updates AppState,
 * then calls render() — keeping persistent and in-memory state in sync.
 *
 * @type {{
 *   transactions:      Array<{id:string, name:string, amount:number, category:string, date:string}>,
 *   customCategories:  string[],
 *   spendingLimits:    Record<string, number>,
 *   summaryVisible:    boolean,
 *   limitPanelVisible: boolean,
 *   chartInstance:     object|null,
 * }}
 */
const AppState = {
  transactions:      [],
  customCategories:  [],
  spendingLimits:    {},
  summaryVisible:    false,
  limitPanelVisible: false,
  chartInstance:     null,
};

// ─── StorageService ───────────────────────────────────────────────────────────

/**
 * Encapsulates all localStorage access.
 * Write methods throw on localStorage errors — callers must catch and call showNotification().
 * loadAll() never throws — it catches per-key errors, returns safe defaults, and records failures.
 */
const StorageService = {
  KEYS: {
    TRANSACTIONS:  'ebv_transactions',
    CUSTOM_CATS:   'ebv_custom_categories',
    LIMITS:        'ebv_spending_limits',
  },

  /**
   * Reads all three storage keys.
   * Each key is wrapped in its own try/catch so a failure in one key
   * does not prevent the others from loading.
   *
   * @returns {{
   *   transactions:      Array<{id:string, name:string, amount:number, category:string, date:string}>,
   *   customCategories:  string[],
   *   spendingLimits:    Record<string, number>,
   *   errors:            { transactions?: true, customCategories?: true, spendingLimits?: true }
   * }}
   */
  loadAll() {
    const errors = {};

    let transactions = [];
    try {
      const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          transactions = parsed;
        }
      }
    } catch (_) {
      errors.transactions = true;
    }

    let customCategories = [];
    try {
      const raw = localStorage.getItem(StorageService.KEYS.CUSTOM_CATS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          customCategories = parsed;
        }
      }
    } catch (_) {
      errors.customCategories = true;
    }

    let spendingLimits = {};
    try {
      const raw = localStorage.getItem(StorageService.KEYS.LIMITS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          spendingLimits = parsed;
        }
      }
    } catch (_) {
      errors.spendingLimits = true;
    }

    return { transactions, customCategories, spendingLimits, errors };
  },

  /**
   * Appends a transaction to the persisted array.
   * Reads the current array first so concurrent tabs cannot cause data loss.
   * Throws if localStorage is unavailable or quota is exceeded.
   *
   * @param {{ id:string, name:string, amount:number, category:string, date:string }} txn
   */
  saveTransaction(txn) {
    const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
    let arr = [];
    try {
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch (_) {
      // Corrupt data — start fresh; the setItem below will overwrite it.
    }
    arr.push(txn);
    localStorage.setItem(StorageService.KEYS.TRANSACTIONS, JSON.stringify(arr));
  },

  /**
   * Removes the transaction with the given id from persistent storage.
   * All other transactions are preserved.
   * Throws if localStorage is unavailable.
   *
   * @param {string} id
   */
  removeTransaction(id) {
    const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
    let arr = [];
    try {
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch (_) {
      // Corrupt data — nothing to remove; write back an empty array.
    }
    const filtered = arr.filter(t => t.id !== id);
    localStorage.setItem(StorageService.KEYS.TRANSACTIONS, JSON.stringify(filtered));
  },

  /**
   * Persists the full custom-categories array.
   * Throws if localStorage is unavailable or quota is exceeded.
   *
   * @param {string[]} arr
   */
  saveCustomCategories(arr) {
    localStorage.setItem(StorageService.KEYS.CUSTOM_CATS, JSON.stringify(arr));
  },

  /**
   * Persists the spending-limits map.
   * Throws if localStorage is unavailable or quota is exceeded.
   *
   * @param {Record<string, number>} obj
   */
  saveSpendingLimits(obj) {
    localStorage.setItem(StorageService.KEYS.LIMITS, JSON.stringify(obj));
  },
};

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Pure validation functions. No side-effects, no DOM access, no localStorage.
 * Every method receives all the data it needs as arguments and returns a result object.
 */
const Validator = {

  /**
   * Validates a transaction form submission.
   *
   * @param {string} name               - Item name entered by the user.
   * @param {string|number} amount      - Amount value from the form (may be a raw string).
   * @param {string} category           - Selected category value.
   * @param {string[]} availableCategories - Full list of valid category names
   *                                       (built-ins + custom). Defaults to BUILTIN_CATEGORIES.
   * @returns {{ valid: boolean, errors: { name?: string, amount?: string, category?: string } }}
   *
   * Validates: Requirements 1.4, 1.5
   */
  validateTransaction(name, amount, category, availableCategories = BUILTIN_CATEGORIES) {
    const errors = {};

    // ── Name validation ───────────────────────────────────────────────────────
    if (name === null || name === undefined || String(name).trim() === '') {
      errors.name = 'Item name is required.';
    } else if (String(name).trim().length > MAX_ITEM_NAME_LENGTH) {
      errors.name = `Item name must be ${MAX_ITEM_NAME_LENGTH} characters or fewer.`;
    }

    // ── Amount validation ─────────────────────────────────────────────────────
    if (amount === null || amount === undefined || String(amount).trim() === '') {
      errors.amount = 'Amount is required.';
    } else {
      const num = Number(amount);
      if (!isFinite(num) || isNaN(num)) {
        errors.amount = `Amount must be a positive number no greater than ${MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
      } else if (num <= 0) {
        errors.amount = `Amount must be a positive number no greater than ${MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
      } else if (num > MAX_AMOUNT) {
        errors.amount = `Amount must be a positive number no greater than ${MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
      }
    }

    // ── Category validation ───────────────────────────────────────────────────
    if (!category || !availableCategories.includes(category)) {
      errors.category = 'Please select a valid category.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },

  /**
   * Validates a new custom category name.
   *
   * @param {string} name       - The candidate custom category name.
   * @param {string[]} existing - All currently known category names
   *                             (built-ins + already-saved custom categories).
   * @returns {{ valid: boolean, error?: string }}
   *
   * Validates: Requirements 6.3, 6.4, 6.5, 6.6
   */
  validateCategory(name, existing = []) {
    if (name === null || name === undefined || String(name).trim() === '') {
      return { valid: false, error: 'Category name cannot be empty.' };
    }

    const trimmed = String(name).trim();

    if (trimmed.length > MAX_CUSTOM_CAT_NAME_LENGTH) {
      return { valid: false, error: `Category name must be ${MAX_CUSTOM_CAT_NAME_LENGTH} characters or fewer.` };
    }

    // Count only the custom categories (existing already excludes built-ins or includes them —
    // the caller decides what goes in `existing`; the limit of 50 applies to custom ones only).
    // Per the design, existing here is the full available list minus built-ins, or the caller
    // passes only custom categories. We count entries that are NOT built-ins to enforce the cap.
    const customCount = existing.filter(c => !BUILTIN_CATEGORIES.includes(c)).length;
    if (customCount >= MAX_CUSTOM_CATEGORIES) {
      return { valid: false, error: `You have reached the maximum of ${MAX_CUSTOM_CATEGORIES} custom categories.` };
    }

    const lowerTrimmed = trimmed.toLowerCase();
    const isDuplicate = existing.some(c => c.toLowerCase() === lowerTrimmed);
    if (isDuplicate) {
      return { valid: false, error: `Category "${trimmed}" already exists.` };
    }

    return { valid: true };
  },

  /**
   * Validates a spending limit value.
   *
   * @param {string|number} value - The raw value from the spending-limit input field.
   * @returns {{ valid: boolean, error?: string }}
   *
   * Validates: Requirement 8.6
   */
  validateSpendingLimit(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return { valid: false, error: 'Spending limit is required.' };
    }

    const num = Number(value);

    if (!isFinite(num) || isNaN(num)) {
      return { valid: false, error: 'Spending limit must be a positive number.' };
    }

    if (num <= 0) {
      return { valid: false, error: 'Spending limit must be a positive number.' };
    }

    if (num > MAX_AMOUNT) {
      return { valid: false, error: `Spending limit must be a positive number no greater than ${MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` };
    }

    return { valid: true };
  },
};

// ─── Pure Compute Functions ───────────────────────────────────────────────────

/**
 * Returns the total of all transaction amounts.
 * Always operates on the full array — never capped at MAX_RENDERED_TRANSACTIONS.
 *
 * @param {Array<{amount: number}>} transactions
 * @returns {number}
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
function computeBalance(transactions) {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Returns a deterministic color for the given category.
 * When isOverLimit is true the alert color is returned regardless of category.
 * Otherwise the color is derived from the category's stable index in the
 * combined [BUILTIN_CATEGORIES, ...AppState.customCategories] array.
 *
 * @param {string}  category    - The category name to look up.
 * @param {boolean} isOverLimit - Whether this category has exceeded its spending limit.
 * @returns {string} A hex color string.
 *
 * Validates: Requirements 4.5, 8.4
 */
function getCategoryColor(category, isOverLimit) {
  if (isOverLimit) {
    return ALERT_COLOR;
  }
  const allCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
  const categoryIndex = allCategories.indexOf(category);
  // Fall back to 0 if category is somehow not found (graceful degradation).
  const index = categoryIndex >= 0 ? categoryIndex : 0;
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

/**
 * Derives the dataset needed to render the spending pie chart.
 * Includes only categories that have at least one transaction.
 * Applies the alert color for any category whose total meets or exceeds its limit.
 *
 * @param {Array<{amount:number, category:string}>} transactions
 * @param {string[]}              customCategories
 * @param {Record<string,number>} spendingLimits
 * @returns {{ labels: string[], data: number[], colors: string[] }}
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 8.3, 8.4
 */
function computeChartData(transactions, customCategories, spendingLimits) {
  // Build per-category totals using a Map to preserve insertion order.
  /** @type {Map<string, number>} */
  const totals = new Map();

  for (const txn of transactions) {
    const current = totals.get(txn.category) || 0;
    totals.set(txn.category, current + txn.amount);
  }

  const labels  = [];
  const data    = [];
  const colors  = [];

  for (const [category, total] of totals) {
    const limit       = spendingLimits[category];
    const isOverLimit = typeof limit === 'number' && total >= limit;

    labels.push(category);
    data.push(total);
    colors.push(getCategoryColor(category, isOverLimit));
  }

  return { labels, data, colors };
}

/**
 * Groups transactions by calendar month.
 * Each key is a 'YYYY-MM' string derived from the transaction's ISO date.
 *
 * @param {Array<{date: string}>} transactions
 * @returns {Map<string, Array<{date:string, amount:number, category:string}>>}
 *
 * Validates: Requirement 7.1
 */
function groupByMonth(transactions) {
  /** @type {Map<string, Array>} */
  const map = new Map();

  for (const txn of transactions) {
    // ISO 8601 dates start with 'YYYY-MM-DD…', so the first 7 chars give 'YYYY-MM'.
    const monthKey = txn.date.slice(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, []);
    }
    map.get(monthKey).push(txn);
  }

  return map;
}

/**
 * Computes a monthly spending summary grouped by category, sorted most-recent-first.
 *
 * @param {Array<{date:string, amount:number, category:string}>} transactions
 * @param {string[]} categories - The full ordered category list
 *                               ([...BUILTIN_CATEGORIES, ...customCategories]).
 * @returns {Array<{ month: string, totals: Record<string, number> }>}
 *
 * Validates: Requirement 7.2
 */
function computeMonthlySummary(transactions, categories) {
  const grouped = groupByMonth(transactions);

  /** @type {Array<{ month: string, totals: Record<string,number> }>} */
  const result = [];

  for (const [month, txns] of grouped) {
    /** @type {Record<string, number>} */
    const totals = {};

    for (const txn of txns) {
      totals[txn.category] = (totals[txn.category] || 0) + txn.amount;
    }

    result.push({ month, totals });
  }

  // Sort descending: most-recent 'YYYY-MM' string first.
  result.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));

  return result;
}

// ─── Render Functions ─────────────────────────────────────────────────────────

/**
 * Formats a number as a US-locale currency string with exactly two decimal places.
 *
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Renders the total balance into #balance-display.
 * Always computed from the full AppState.transactions array (never capped).
 *
 * Validates: Requirements 3.1, 3.4
 */
function renderBalance() {
  const balance = computeBalance(AppState.transactions);
  const el = document.getElementById('balance-display');
  if (el) {
    el.textContent = formatCurrency(balance);
  }
}

/**
 * Renders the transaction list into #txn-list.
 *
 * - Sorts AppState.transactions descending by date.
 * - Slices to MAX_RENDERED_TRANSACTIONS for display.
 * - Per-category totals (for alert detection) are computed from the full array.
 * - Each <li data-id="…"> shows name, amount, category, and date.
 * - Applies CSS class 'txn-alert' when category total ≥ spending limit.
 * - Shows empty-state message when there are no transactions.
 *
 * Validates: Requirements 2.1, 2.3, 2.5, 8.3, 10.5
 */
function renderTransactionList() {
  const list = document.getElementById('txn-list');
  if (!list) return;

  // Clear current content.
  list.innerHTML = '';

  if (AppState.transactions.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No transactions recorded.';
    list.appendChild(li);
    return;
  }

  // Compute per-category totals from the FULL array (not the display slice).
  /** @type {Record<string, number>} */
  const categoryTotals = {};
  for (const txn of AppState.transactions) {
    categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + txn.amount;
  }

  // Sort a shallow copy descending by date so the original array order is preserved.
  const sorted = AppState.transactions.slice().sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return  1;
    return 0;
  });

  // Cap the display list.
  const display = sorted.slice(0, MAX_RENDERED_TRANSACTIONS);

  for (const txn of display) {
    const li = document.createElement('li');
    li.dataset.id = txn.id;

    // Determine alert state for this row.
    const limit = AppState.spendingLimits[txn.category];
    const isOverLimit = typeof limit === 'number' && categoryTotals[txn.category] >= limit;
    if (isOverLimit) {
      li.classList.add('txn-alert');
    }

    // Build display content.
    const nameSpan = document.createElement('span');
    nameSpan.className = 'txn-name';
    nameSpan.textContent = txn.name;

    const amountSpan = document.createElement('span');
    amountSpan.className = 'txn-amount';
    amountSpan.textContent = formatCurrency(txn.amount);

    const categorySpan = document.createElement('span');
    categorySpan.className = 'txn-category';
    categorySpan.textContent = txn.category;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'txn-date';
    // Display a human-readable locale date string.
    dateSpan.textContent = new Date(txn.date).toLocaleDateString();

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.dataset.id = txn.id;

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    li.appendChild(categorySpan);
    li.appendChild(dateSpan);
    li.appendChild(deleteBtn);

    list.appendChild(li);
  }
}

/**
 * Renders (or updates) the spending pie chart in #spending-chart.
 *
 * - If there is no data, hides the canvas and shows #chart-placeholder.
 * - If AppState.chartInstance already exists, updates it in-place (no destroy/recreate).
 * - Otherwise creates a new Chart.js instance and stores it in AppState.chartInstance.
 *
 * Validates: Requirements 4.1, 4.4, 4.6
 */
function renderChart() {
  const canvas      = document.getElementById('spending-chart');
  const placeholder = document.getElementById('chart-placeholder');

  if (!canvas || !placeholder) return;

  const { labels, data, colors } = computeChartData(
    AppState.transactions,
    AppState.customCategories,
    AppState.spendingLimits
  );

  if (data.length === 0) {
    // No data — show placeholder, hide chart.
    canvas.hidden      = true;
    placeholder.hidden = false;

    // Destroy the existing chart instance so it does not linger.
    if (AppState.chartInstance) {
      AppState.chartInstance.destroy();
      AppState.chartInstance = null;
    }
    return;
  }

  // We have data — ensure chart is visible and placeholder is hidden.
  canvas.hidden      = false;
  placeholder.hidden = true;

  if (AppState.chartInstance) {
    // Reuse the existing Chart.js instance.
    AppState.chartInstance.data.labels                       = labels;
    AppState.chartInstance.data.datasets[0].data             = data;
    AppState.chartInstance.data.datasets[0].backgroundColor  = colors;
    AppState.chartInstance.update();
  } else {
    // Create a new Chart.js pie chart.
    try {
      AppState.chartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const value = context.parsed;
                  return ` ${context.label}: ${formatCurrency(value)}`;
                },
              },
            },
          },
        },
      });
    } catch (err) {
      // Chart.js failed to load or initialize — show fallback message.
      console.error('Chart.js failed to initialize:', err);
      canvas.hidden      = true;
      placeholder.hidden = false;
      placeholder.textContent = 'Chart could not be loaded. Please check your connection.';
    }
  }
}

/**
 * Renders the monthly summary table into #monthly-summary.
 * Only called when AppState.summaryVisible is true.
 *
 * - Columns: "Month" + one column per category that has at least one transaction.
 * - Rows: one per month, sorted most-recent first.
 * - Shows a no-data message when there are no transactions.
 *
 * Validates: Requirements 7.2, 7.5
 */
function renderMonthlySummary() {
  const section = document.getElementById('monthly-summary');
  if (!section) return;

  const allCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
  const summary = computeMonthlySummary(AppState.transactions, allCategories);

  // Preserve the heading but replace all other children.
  // Find or create the heading.
  let heading = section.querySelector('h2');
  section.innerHTML = '';
  if (!heading) {
    heading = document.createElement('h2');
    heading.textContent = 'Monthly Summary';
  }
  section.appendChild(heading);

  if (summary.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-state';
    msg.textContent = 'No data to display yet.';
    section.appendChild(msg);
    return;
  }

  // Determine which categories actually appear across all months.
  const activeCategories = allCategories.filter(cat =>
    summary.some(entry => typeof entry.totals[cat] === 'number')
  );

  // Build the table.
  const table = document.createElement('table');
  table.className = 'monthly-summary-table';

  // Header row.
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const thMonth = document.createElement('th');
  thMonth.textContent = 'Month';
  thMonth.scope = 'col';
  headerRow.appendChild(thMonth);

  for (const cat of activeCategories) {
    const th = document.createElement('th');
    th.textContent = cat;
    th.scope = 'col';
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows — one per month.
  const tbody = document.createElement('tbody');

  for (const entry of summary) {
    const tr = document.createElement('tr');

    const tdMonth = document.createElement('td');
    tdMonth.textContent = entry.month;
    tr.appendChild(tdMonth);

    for (const cat of activeCategories) {
      const td = document.createElement('td');
      const total = entry.totals[cat];
      td.textContent = typeof total === 'number' ? formatCurrency(total) : '—';
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  section.appendChild(table);
}

/**
 * Renders the per-category spending limit inputs into #limit-settings.
 * Only called when AppState.limitPanelVisible is true.
 *
 * Each category (built-in + custom) gets a row with:
 *   - A label showing the category name
 *   - A number input pre-filled with the current limit (if set)
 *   - A "Save" button wired to handleSaveLimit
 *   - A "Clear" button wired to handleClearLimit
 *
 * Validates: Requirements 8.1, 8.7
 */
function renderSpendingLimitsPanel() {
  const panel = document.getElementById('limit-settings');
  if (!panel) return;

  const allCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];

  // Preserve the heading but rebuild the rest.
  let heading = panel.querySelector('h2');
  panel.innerHTML = '';
  if (!heading) {
    heading = document.createElement('h2');
    heading.textContent = 'Spending Limits';
  }
  panel.appendChild(heading);

  const form = document.createElement('div');
  form.className = 'limit-rows';

  for (const cat of allCategories) {
    const row = document.createElement('div');
    row.className = 'limit-row';

    const label = document.createElement('label');
    label.textContent = cat;

    const input = document.createElement('input');
    input.type = 'number';
    input.min  = String(MIN_AMOUNT);
    input.max  = String(MAX_AMOUNT);
    input.step = '0.01';
    input.placeholder = 'e.g. 200.00';
    input.className = 'limit-input';
    input.dataset.category = cat;
    // Pre-fill if a limit is already set.
    if (typeof AppState.spendingLimits[cat] === 'number') {
      input.value = String(AppState.spendingLimits[cat]);
    }

    // Inline error span for validation feedback.
    const errorSpan = document.createElement('span');
    errorSpan.className = 'error limit-error';
    errorSpan.id = `limit-error-${cat.replace(/\s+/g, '-')}`;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.className = 'limit-save-btn';
    saveBtn.addEventListener('click', () => {
      // handleSaveLimit is implemented in task 7; it exists at runtime.
      handleSaveLimit(cat, input.value);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'limit-clear-btn';
    clearBtn.addEventListener('click', () => {
      handleClearLimit(cat);
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(errorSpan);
    row.appendChild(saveBtn);
    row.appendChild(clearBtn);

    form.appendChild(row);
  }

  panel.appendChild(form);
}

/**
 * Master render pass — re-derives the entire UI from AppState.
 * Idempotent: calling it twice in a row produces the same result.
 *
 * Validates: Requirements 1.2, 7.3, 7.4
 */
function render() {
  // ── Sync the category <select> options ───────────────────────────────────
  const categorySelect = document.getElementById('category');
  if (categorySelect) {
    const allCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
    // Remember the currently-selected value so we can restore it if it's still valid.
    const currentValue = categorySelect.value;

    categorySelect.innerHTML = '';
    for (const cat of allCategories) {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    }

    // Restore selection if still valid; otherwise default to first option.
    if (allCategories.includes(currentValue)) {
      categorySelect.value = currentValue;
    } else {
      categorySelect.value = allCategories[0] || '';
    }
  }

  // ── Core renders (always run) ─────────────────────────────────────────────
  renderBalance();
  renderTransactionList();
  renderChart();

  // ── Conditional panels — rendered into modals, not inline sections ────────
  // Re-render content if the modal is currently open, so data stays fresh.
  if (AppState.summaryVisible) {
    renderMonthlySummary();
  }

  if (AppState.limitPanelVisible) {
    renderSpendingLimitsPanel();
  }
}

// ─── Notification System ──────────────────────────────────────────────────────

/**
 * Displays a persistent notification bar with the given message.
 * The bar remains visible until the user explicitly dismisses it.
 *
 * @param {string} message
 *
 * Validates: Requirements 5.4, 5.5, 5.6
 */
function showNotification(message) {
  const bar = document.getElementById('notification-bar');
  const msg = document.getElementById('notification-msg');
  if (!bar || !msg) return;
  msg.textContent = message;
  bar.removeAttribute('hidden');
}

/**
 * Hides the notification bar.
 *
 * Validates: Requirements 5.4, 5.5, 5.6
 */
function dismissNotification() {
  const bar = document.getElementById('notification-bar');
  if (bar) {
    bar.setAttribute('hidden', '');
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

/**
 * Handles the transaction form submit event.
 * Validates inputs, persists to localStorage, updates AppState, resets form.
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 5.1
 *
 * @param {Event} event
 */
function handleFormSubmit(event) {
  event.preventDefault();

  const nameInput     = document.getElementById('item-name');
  const amountInput   = document.getElementById('amount');
  const categoryInput = document.getElementById('category');

  const name     = nameInput     ? nameInput.value     : '';
  const amount   = amountInput   ? amountInput.value   : '';
  const category = categoryInput ? categoryInput.value : '';

  const availableCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
  const result = Validator.validateTransaction(name, amount, category, availableCategories);

  // Display or clear inline errors.
  const nameError     = document.getElementById('item-name-error');
  const amountError   = document.getElementById('amount-error');
  const categoryError = document.getElementById('category-error');

  if (nameError)     nameError.textContent     = result.errors.name     || '';
  if (amountError)   amountError.textContent   = result.errors.amount   || '';
  if (categoryError) categoryError.textContent = result.errors.category || '';

  if (!result.valid) return;

  // Build the transaction object.
  const txn = {
    id:       (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : Date.now().toString(),
    name:     name.trim(),
    amount:   parseFloat(amount),
    category,
    date:     new Date().toISOString(),
  };

  // Persist first — on failure abort without mutating AppState.
  try {
    StorageService.saveTransaction(txn);
  } catch (_) {
    showNotification('Data cannot be saved. LocalStorage is unavailable or full.');
    return;
  }

  // Update in-memory state, reset form, re-render.
  AppState.transactions.push(txn);

  if (nameInput)     nameInput.value     = '';
  if (amountInput)   amountInput.value   = '';
  if (categoryInput) categoryInput.value = 'Food';

  render();
}

/**
 * Removes a transaction identified by `id` from storage and AppState.
 * Shows an error notification if storage removal fails; leaves the list unchanged.
 *
 * Validates: Requirements 2.4, 2.6, 5.3
 *
 * @param {string} id
 */
function handleDeleteClick(id) {
  try {
    StorageService.removeTransaction(id);
  } catch (_) {
    showNotification('Deletion failed. LocalStorage is unavailable.');
    return;
  }

  const idx = AppState.transactions.findIndex(t => t.id === id);
  if (idx !== -1) {
    AppState.transactions.splice(idx, 1);
  }

  render();
}

/**
 * Reads the custom category input, validates it, persists it, and updates state.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6
 */
function handleAddCategory() {
  const input = document.getElementById('custom-cat-input');
  const errorSpan = document.getElementById('custom-cat-error');

  const name = input ? input.value : '';

  const allExisting = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
  const result = Validator.validateCategory(name, allExisting);

  if (!result.valid) {
    if (errorSpan) errorSpan.textContent = result.error || 'Invalid category name.';
    return;
  }

  const trimmed = name.trim();
  const updated = [...AppState.customCategories, trimmed];

  try {
    StorageService.saveCustomCategories(updated);
  } catch (_) {
    showNotification('Category could not be saved. LocalStorage is unavailable or full.');
    return;
  }

  AppState.customCategories.push(trimmed);
  if (errorSpan) errorSpan.textContent = '';
  if (input) input.value = '';

  render();
}

/**
 * Saves a spending limit for a category after validation.
 * Updates the inline error in the limits panel on failure.
 *
 * Validates: Requirements 8.2, 8.6
 *
 * @param {string}        category
 * @param {string|number} value
 */
function handleSaveLimit(category, value) {
  const errorSpanId = `limit-error-${category.replace(/\s+/g, '-')}`;
  const errorSpan   = document.getElementById(errorSpanId);

  const result = Validator.validateSpendingLimit(value);

  if (!result.valid) {
    if (errorSpan) errorSpan.textContent = result.error || 'Invalid spending limit.';
    return;
  }

  if (errorSpan) errorSpan.textContent = '';

  AppState.spendingLimits[category] = parseFloat(value);

  try {
    StorageService.saveSpendingLimits(AppState.spendingLimits);
  } catch (_) {
    showNotification('Spending limit could not be saved. LocalStorage is unavailable or full.');
    return;
  }

  render();
}

/**
 * Clears the spending limit for a category, removes it from storage, and re-renders.
 *
 * Validates: Requirements 8.7
 *
 * @param {string} category
 */
function handleClearLimit(category) {
  delete AppState.spendingLimits[category];

  try {
    StorageService.saveSpendingLimits(AppState.spendingLimits);
  } catch (_) {
    showNotification('Could not update spending limits. LocalStorage is unavailable.');
  }

  render();
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Bootstraps the application on DOMContentLoaded.
 *
 * - Loads all persisted data from LocalStorage and populates AppState.
 * - Shows per-key notifications for any load errors.
 * - Wires all event listeners.
 * - Calls render() to paint the initial UI.
 *
 * Validates: Requirements 5.2, 6.7, 6.8, 7.3
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── Load persisted state ───────────────────────────────────────────────────
  const { transactions, customCategories, spendingLimits, errors } = StorageService.loadAll();

  if (errors.transactions) {
    // Could be a parse error (malformed data) or a read error.
    showNotification('Saved transaction data could not be loaded and has been reset.');
  }

  if (errors.customCategories) {
    showNotification('Saved category data could not be restored.');
  }

  AppState.transactions     = errors.transactions     ? []              : transactions;
  AppState.customCategories = errors.customCategories ? []              : customCategories;
  AppState.spendingLimits   = errors.spendingLimits   ? {}              : spendingLimits;

  // ── Wire form submit ───────────────────────────────────────────────────────
  const txnForm = document.getElementById('txn-form');
  if (txnForm) {
    txnForm.addEventListener('submit', handleFormSubmit);
  }

  // ── Wire custom category button ────────────────────────────────────────────
  const addCatBtn = document.getElementById('add-cat-btn');
  if (addCatBtn) {
    addCatBtn.addEventListener('click', handleAddCategory);
  }

  // ── Wire delete via event delegation on the transaction list ───────────────
  const txnList = document.getElementById('txn-list');
  if (txnList) {
    txnList.addEventListener('click', (event) => {
      if (event.target && event.target.classList.contains('delete-btn')) {
        const id = event.target.dataset.id;
        if (id) handleDeleteClick(id);
      }
    });
  }

  // ── Wire notification dismiss button ──────────────────────────────────────
  const dismissBtn = document.getElementById('notification-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', dismissNotification);
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      // Focus the close button for keyboard accessibility.
      const closeBtn = modal.querySelector('.modal-close-btn');
      if (closeBtn) closeBtn.focus();
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.setAttribute('hidden', '');
      document.body.style.overflow = '';
    }
  }

  // Close modal when backdrop or close button is clicked.
  document.querySelectorAll('.modal').forEach(modal => {
    const closeBtn = modal.querySelector('.modal-close-btn');
    const backdrop = modal.querySelector('.modal-backdrop');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (modal.id === 'modal-summary') {
          AppState.summaryVisible = false;
        } else if (modal.id === 'modal-limits') {
          AppState.limitPanelVisible = false;
        }
        closeModal(modal.id);
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        if (modal.id === 'modal-summary') {
          AppState.summaryVisible = false;
        } else if (modal.id === 'modal-limits') {
          AppState.limitPanelVisible = false;
        }
        closeModal(modal.id);
      });
    }
  });

  // Close modal on Escape key.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (AppState.summaryVisible) {
        AppState.summaryVisible = false;
        closeModal('modal-summary');
      }
      if (AppState.limitPanelVisible) {
        AppState.limitPanelVisible = false;
        closeModal('modal-limits');
      }
    }
  });

  // ── Wire toggle buttons ────────────────────────────────────────────────────
  const toggleSummaryBtn = document.getElementById('toggle-summary-btn');
  if (toggleSummaryBtn) {
    toggleSummaryBtn.addEventListener('click', () => {
      AppState.summaryVisible = true;
      renderMonthlySummary();
      openModal('modal-summary');
    });
  }

  const toggleLimitsBtn = document.getElementById('toggle-limits-btn');
  if (toggleLimitsBtn) {
    toggleLimitsBtn.addEventListener('click', () => {
      AppState.limitPanelVisible = true;
      renderSpendingLimitsPanel();
      openModal('modal-limits');
    });
  }

  // ── Initial render ─────────────────────────────────────────────────────────
  render();
});

