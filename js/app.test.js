/**
 * Expense & Budget Visualizer — Pure-function test suite
 * Uses Jest (unit tests) + fast-check (property-based tests)
 * Feature: expense-budget-visualizer
 */

'use strict';

const fc = require('fast-check');

// ─── In-memory localStorage mock ─────────────────────────────────────────────

const localStorageMock = (() => {
  let store = {};
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value); },
    removeItem: (key)        => { delete store[key]; },
    clear:      ()           => { store = {}; },
    _store:     ()           => store,
    _reset:     ()           => { store = {}; },
  };
})();

global.localStorage = localStorageMock;

// ─── Inline constants (mirrors app.js) ───────────────────────────────────────

const BUILTIN_CATEGORIES = ['Food', 'Transport', 'Fun'];

const MAX_ITEM_NAME_LENGTH       = 100;
const MAX_AMOUNT                 = 999_999_999.99;
const MIN_AMOUNT                 = 0.01;
const MAX_CUSTOM_CAT_NAME_LENGTH = 50;
const MAX_CUSTOM_CATEGORIES      = 50;
const MAX_RENDERED_TRANSACTIONS  = 500;

const ALERT_COLOR = '#e74c3c';

const CATEGORY_COLORS = [
  '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c',
  '#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
  '#16a085', '#f1c40f', '#c0392b', '#2c3e50', '#7f8c8d',
  '#e91e63', '#00bcd4', '#4caf50', '#ff5722', '#607d8b',
  '#9c27b0', '#ff9800', '#795548', '#673ab7', '#3f51b5',
  '#009688', '#8bc34a', '#cddc39', '#ffc107', '#ff5252',
  '#40c4ff', '#69f0ae', '#ea80fc', '#ffab40', '#b2ff59',
  '#84ffff', '#80d8ff', '#a7ffeb', '#ccff90', '#ffe57f',
  '#ff6e40', '#d500f9', '#00b0ff', '#1de9b6', '#76ff03',
  '#c6ff00', '#ffea00', '#ff6d00', '#dd2c00', '#aa00ff',
  '#304ffe', '#00b8d4', '#00bfa5',
];

// AppState global — getCategoryColor reads AppState.customCategories
const AppState = {
  transactions:      [],
  customCategories:  [],
  spendingLimits:    {},
  summaryVisible:    false,
  limitPanelVisible: false,
  chartInstance:     null,
};

// ─── Inline pure functions (mirrors app.js) ───────────────────────────────────

const Validator = {
  validateTransaction(name, amount, category, availableCategories = BUILTIN_CATEGORIES) {
    const errors = {};

    if (name === null || name === undefined || String(name).trim() === '') {
      errors.name = 'Item name is required.';
    } else if (String(name).trim().length > MAX_ITEM_NAME_LENGTH) {
      errors.name = `Item name must be ${MAX_ITEM_NAME_LENGTH} characters or fewer.`;
    }

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

    if (!category || !availableCategories.includes(category)) {
      errors.category = 'Please select a valid category.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  },

  validateCategory(name, existing = []) {
    if (name === null || name === undefined || String(name).trim() === '') {
      return { valid: false, error: 'Category name cannot be empty.' };
    }

    const trimmed = String(name).trim();

    if (trimmed.length > MAX_CUSTOM_CAT_NAME_LENGTH) {
      return { valid: false, error: `Category name must be ${MAX_CUSTOM_CAT_NAME_LENGTH} characters or fewer.` };
    }

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

function computeBalance(transactions) {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

function getCategoryColor(category, isOverLimit) {
  if (isOverLimit) return ALERT_COLOR;
  const allCategories = [...BUILTIN_CATEGORIES, ...AppState.customCategories];
  const categoryIndex = allCategories.indexOf(category);
  const index = categoryIndex >= 0 ? categoryIndex : 0;
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function computeChartData(transactions, customCategories, spendingLimits) {
  const totals = new Map();
  for (const txn of transactions) {
    totals.set(txn.category, (totals.get(txn.category) || 0) + txn.amount);
  }

  const labels = [], data = [], colors = [];
  for (const [category, total] of totals) {
    const limit       = spendingLimits[category];
    const isOverLimit = typeof limit === 'number' && total >= limit;
    labels.push(category);
    data.push(total);
    colors.push(getCategoryColor(category, isOverLimit));
  }
  return { labels, data, colors };
}

function groupByMonth(transactions) {
  const map = new Map();
  for (const txn of transactions) {
    const monthKey = txn.date.slice(0, 7);
    if (!map.has(monthKey)) map.set(monthKey, []);
    map.get(monthKey).push(txn);
  }
  return map;
}

function computeMonthlySummary(transactions, categories) {
  const grouped = groupByMonth(transactions);
  const result = [];
  for (const [month, txns] of grouped) {
    const totals = {};
    for (const txn of txns) {
      totals[txn.category] = (totals[txn.category] || 0) + txn.amount;
    }
    result.push({ month, totals });
  }
  result.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
  return result;
}

// ─── StorageService (inline, same as app.js) ─────────────────────────────────

const StorageService = {
  KEYS: {
    TRANSACTIONS: 'ebv_transactions',
    CUSTOM_CATS:  'ebv_custom_categories',
    LIMITS:       'ebv_spending_limits',
  },

  loadAll() {
    const errors = {};

    let transactions = [];
    try {
      const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) transactions = parsed;
      }
    } catch (_) { errors.transactions = true; }

    let customCategories = [];
    try {
      const raw = localStorage.getItem(StorageService.KEYS.CUSTOM_CATS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) customCategories = parsed;
      }
    } catch (_) { errors.customCategories = true; }

    let spendingLimits = {};
    try {
      const raw = localStorage.getItem(StorageService.KEYS.LIMITS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          spendingLimits = parsed;
        }
      }
    } catch (_) { errors.spendingLimits = true; }

    return { transactions, customCategories, spendingLimits, errors };
  },

  saveTransaction(txn) {
    const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
    let arr = [];
    try {
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch (_) {}
    arr.push(txn);
    localStorage.setItem(StorageService.KEYS.TRANSACTIONS, JSON.stringify(arr));
  },

  removeTransaction(id) {
    const raw = localStorage.getItem(StorageService.KEYS.TRANSACTIONS);
    let arr = [];
    try {
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch (_) {}
    const filtered = arr.filter(t => t.id !== id);
    localStorage.setItem(StorageService.KEYS.TRANSACTIONS, JSON.stringify(filtered));
  },

  saveCustomCategories(arr) {
    localStorage.setItem(StorageService.KEYS.CUSTOM_CATS, JSON.stringify(arr));
  },

  saveSpendingLimits(obj) {
    localStorage.setItem(StorageService.KEYS.LIMITS, JSON.stringify(obj));
  },
};

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a valid transaction object */
const validTransactionArb = fc.record({
  id:       fc.uuid(),
  name:     fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
  amount:   fc.double({ min: MIN_AMOUNT, max: MAX_AMOUNT, noNaN: true }),
  category: fc.constantFrom(...BUILTIN_CATEGORIES),
  date:     fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') })
              .map(d => d.toISOString()),
});

// ─────────────────────────────────────────────────────────────────────────────
//  1. Validator.validateTransaction
// ─────────────────────────────────────────────────────────────────────────────

describe('Validator.validateTransaction', () => {
  beforeEach(() => { AppState.customCategories = []; });

  test('valid inputs pass', () => {
    const result = Validator.validateTransaction('Lunch', '12.50', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('empty name → errors.name set, valid: false', () => {
    const result = Validator.validateTransaction('', '10', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  test('name > 100 chars → errors.name set', () => {
    const result = Validator.validateTransaction('a'.repeat(101), '10', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  test('empty amount → errors.amount set', () => {
    const result = Validator.validateTransaction('Lunch', '', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  test('amount = 0 → errors.amount set', () => {
    const result = Validator.validateTransaction('Lunch', '0', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  test('amount < 0 → errors.amount set', () => {
    const result = Validator.validateTransaction('Lunch', '-5', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  test('amount > MAX_AMOUNT → errors.amount set', () => {
    const result = Validator.validateTransaction('Lunch', '1000000000', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  test('non-numeric amount string → errors.amount set', () => {
    const result = Validator.validateTransaction('Lunch', 'abc', 'Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  test('invalid category → errors.category set', () => {
    const result = Validator.validateTransaction('Lunch', '10', 'Unicorn', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBeDefined();
  });

  // Feature: expense-budget-visualizer, Property 4: Invalid amount is rejected
  test('Property 4: any amount ≤ 0, > MAX_AMOUNT, or non-numeric → errors.amount set', () => {
    // ≤ 0 numbers
    fc.assert(fc.property(
      fc.oneof(
        fc.double({ max: 0, noNaN: true }),
        fc.constant(0),
        fc.double({ min: MAX_AMOUNT + 1, noNaN: true }).filter(n => isFinite(n))
      ),
      (amt) => {
        const result = Validator.validateTransaction('Item', String(amt), 'Food', BUILTIN_CATEGORIES);
        return result.errors.amount !== undefined;
      }
    ), { numRuns: 100 });

    // Non-numeric strings
    fc.assert(fc.property(
      fc.string({ minLength: 1 }).filter(s => isNaN(Number(s)) || s.trim() === ''),
      (amt) => {
        const result = Validator.validateTransaction('Item', amt, 'Food', BUILTIN_CATEGORIES);
        return result.errors.amount !== undefined;
      }
    ), { numRuns: 100 });
  });

  // Feature: expense-budget-visualizer, Property 3: Incomplete form is rejected
  test('Property 3: any submission missing ≥ 1 required field → valid is false', () => {
    fc.assert(fc.property(
      fc.oneof(
        // missing name
        fc.record({
          name:     fc.constant(''),
          amount:   fc.double({ min: MIN_AMOUNT, max: MAX_AMOUNT, noNaN: true }).map(String),
          category: fc.constantFrom(...BUILTIN_CATEGORIES),
        }),
        // missing amount
        fc.record({
          name:     fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          amount:   fc.constant(''),
          category: fc.constantFrom(...BUILTIN_CATEGORIES),
        }),
        // missing category (empty string)
        fc.record({
          name:     fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          amount:   fc.double({ min: MIN_AMOUNT, max: MAX_AMOUNT, noNaN: true }).map(String),
          category: fc.constant(''),
        }),
      ),
      ({ name, amount, category }) => {
        const result = Validator.validateTransaction(name, amount, category, BUILTIN_CATEGORIES);
        return result.valid === false && Object.keys(result.errors).length > 0;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. Validator.validateCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('Validator.validateCategory', () => {
  test('valid name (1–50 chars, not duplicate) → { valid: true }', () => {
    const result = Validator.validateCategory('Hobbies', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('empty name → error', () => {
    const result = Validator.validateCategory('', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('name > 50 chars → error', () => {
    const result = Validator.validateCategory('a'.repeat(51), BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('exact-case duplicate → error', () => {
    const result = Validator.validateCategory('Food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('case-insensitive duplicate → error', () => {
    const result = Validator.validateCategory('food', BUILTIN_CATEGORIES);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('50 custom categories already → limit error', () => {
    const existing = [
      ...BUILTIN_CATEGORIES,
      ...Array.from({ length: 50 }, (_, i) => `Custom${i}`),
    ];
    const result = Validator.validateCategory('NewCat', existing);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // Feature: expense-budget-visualizer, Property 12: Oversized custom category name is rejected
  test('Property 12: any string length > 50 → error', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 51, maxLength: 200 }),
      (name) => {
        const result = Validator.validateCategory(name, BUILTIN_CATEGORIES);
        return result.valid === false && result.error !== undefined;
      }
    ), { numRuns: 100 });
  });

  // Feature: expense-budget-visualizer, Property 13: Duplicate category name is rejected (case-insensitive)
  test('Property 13: any capitalization variant of existing name → duplicate error', () => {
    fc.assert(fc.property(
      fc.constantFrom(...BUILTIN_CATEGORIES),
      // Generate a random-case variant of the chosen built-in
      fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
      (baseCategory, flips) => {
        const variant = baseCategory
          .split('')
          .map((ch, i) => (flips[i % flips.length] ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');
        const result = Validator.validateCategory(variant, BUILTIN_CATEGORIES);
        return result.valid === false && result.error !== undefined;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. Validator.validateSpendingLimit
// ─────────────────────────────────────────────────────────────────────────────

describe('Validator.validateSpendingLimit', () => {
  test('valid value → { valid: true }', () => {
    expect(Validator.validateSpendingLimit(100).valid).toBe(true);
    expect(Validator.validateSpendingLimit('50.25').valid).toBe(true);
    expect(Validator.validateSpendingLimit(MAX_AMOUNT).valid).toBe(true);
    expect(Validator.validateSpendingLimit(MIN_AMOUNT).valid).toBe(true);
  });

  test('empty string → error', () => {
    const result = Validator.validateSpendingLimit('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('"0" → error', () => {
    const result = Validator.validateSpendingLimit('0');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('"-5" → error', () => {
    const result = Validator.validateSpendingLimit('-5');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('"abc" → error', () => {
    const result = Validator.validateSpendingLimit('abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // Feature: expense-budget-visualizer, Property 19: Invalid spending limit is rejected
  test('Property 19: empty/non-numeric/zero/negative → error', () => {
    // Empty / null / undefined
    for (const v of ['', null, undefined]) {
      expect(Validator.validateSpendingLimit(v).valid).toBe(false);
    }

    // Non-numeric strings
    fc.assert(fc.property(
      fc.string({ minLength: 1 }).filter(s => isNaN(Number(s)) || s.trim() === ''),
      (val) => Validator.validateSpendingLimit(val).valid === false
    ), { numRuns: 100 });

    // Zero
    expect(Validator.validateSpendingLimit(0).valid).toBe(false);

    // Negative numbers
    fc.assert(fc.property(
      fc.double({ max: 0, noNaN: true }),
      (val) => Validator.validateSpendingLimit(val).valid === false
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. computeBalance
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBalance', () => {
  test('empty array → 0', () => {
    expect(computeBalance([])).toBe(0);
  });

  test('single transaction → its amount', () => {
    expect(computeBalance([{ amount: 42.5 }])).toBe(42.5);
  });

  test('multiple transactions → sum', () => {
    const txns = [{ amount: 10 }, { amount: 20.5 }, { amount: 5.25 }];
    expect(computeBalance(txns)).toBeCloseTo(35.75, 5);
  });

  // Feature: expense-budget-visualizer, Property 8: Balance equals sum of all transaction amounts
  test('Property 8: result equals reduce sum over all transactions', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({ amount: fc.double({ min: 0.01, max: MAX_AMOUNT, noNaN: true }) }),
        { minLength: 0, maxLength: 200 }
      ),
      (txns) => {
        const expected = txns.reduce((s, t) => s + t.amount, 0);
        return computeBalance(txns) === expected;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. getCategoryColor
// ─────────────────────────────────────────────────────────────────────────────

describe('getCategoryColor', () => {
  beforeEach(() => { AppState.customCategories = []; });

  test('isOverLimit: true → ALERT_COLOR', () => {
    expect(getCategoryColor('Food', true)).toBe(ALERT_COLOR);
    expect(getCategoryColor('Unknown', true)).toBe(ALERT_COLOR);
  });

  test('isOverLimit: false + known built-in → color from CATEGORY_COLORS', () => {
    const color = getCategoryColor('Food', false);
    expect(CATEGORY_COLORS).toContain(color);
  });

  test('each built-in category gets a different color', () => {
    const colors = BUILTIN_CATEGORIES.map(c => getCategoryColor(c, false));
    const unique = new Set(colors);
    expect(unique.size).toBe(BUILTIN_CATEGORIES.length);
  });

  // Feature: expense-budget-visualizer, Property 10: Category colors are unique
  test('Property 10: N ≤ 53 distinct categories with isOverLimit=false → no duplicate colors', () => {
    fc.assert(fc.property(
      // Build N unique category names (use built-in prefix trick to stay ≤ 53)
      fc.integer({ min: 1, max: 53 }).chain(n => {
        // Use custom category names built from indices to guarantee distinctness
        return fc.constant(Array.from({ length: n }, (_, i) => `Cat_${i}`));
      }),
      (categoryNames) => {
        // Set up AppState so getCategoryColor can find them in the combined array
        // We override BUILTIN_CATEGORIES indirectly by setting customCategories such that
        // the combined array = [...BUILTIN_CATEGORIES, ...customCategories] covers our names.
        // Simplest: just use pure-index names starting at 0 to match CATEGORY_COLORS indices.
        // getCategoryColor uses allCategories.indexOf — so we need names present in allCategories.
        // We inject them as customCategories (after built-ins).
        const builtInCount = BUILTIN_CATEGORIES.length;
        // First builtInCount names are the built-ins; rest are custom
        const builtInNames = BUILTIN_CATEGORIES.slice(0, Math.min(builtInCount, categoryNames.length));
        const customNames  = categoryNames.slice(builtInCount);
        AppState.customCategories = customNames;

        const testNames = [...BUILTIN_CATEGORIES.slice(0, builtInNames.length), ...customNames];
        const tested    = testNames.slice(0, categoryNames.length);

        const colors = tested.map(c => getCategoryColor(c, false));
        const unique = new Set(colors);
        return unique.size === colors.length;
      }
    ), { numRuns: 100 });

    AppState.customCategories = []; // restore
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. computeChartData
// ─────────────────────────────────────────────────────────────────────────────

describe('computeChartData', () => {
  beforeEach(() => { AppState.customCategories = []; });

  test('empty transactions → empty arrays', () => {
    const result = computeChartData([], [], {});
    expect(result).toEqual({ labels: [], data: [], colors: [] });
  });

  test('single category → one entry with correct total', () => {
    const txns = [
      { amount: 10, category: 'Food' },
      { amount: 20, category: 'Food' },
    ];
    const result = computeChartData(txns, [], {});
    expect(result.labels).toEqual(['Food']);
    expect(result.data[0]).toBeCloseTo(30, 5);
  });

  test('multiple categories → one entry per category with correct totals', () => {
    const txns = [
      { amount: 10, category: 'Food' },
      { amount: 5,  category: 'Transport' },
      { amount: 7,  category: 'Food' },
    ];
    const result = computeChartData(txns, [], {});
    const foodIdx      = result.labels.indexOf('Food');
    const transportIdx = result.labels.indexOf('Transport');
    expect(result.labels.length).toBe(2);
    expect(result.data[foodIdx]).toBeCloseTo(17, 5);
    expect(result.data[transportIdx]).toBeCloseTo(5, 5);
  });

  test('category at or over spending limit → color is ALERT_COLOR', () => {
    const txns = [{ amount: 100, category: 'Food' }];
    const result = computeChartData(txns, [], { Food: 100 });
    const foodIdx = result.labels.indexOf('Food');
    expect(result.colors[foodIdx]).toBe(ALERT_COLOR);
  });

  test('category below spending limit → color is NOT ALERT_COLOR', () => {
    const txns = [{ amount: 50, category: 'Food' }];
    const result = computeChartData(txns, [], { Food: 100 });
    const foodIdx = result.labels.indexOf('Food');
    expect(result.colors[foodIdx]).not.toBe(ALERT_COLOR);
  });

  // Feature: expense-budget-visualizer, Property 9: Chart data reflects per-category totals
  test('Property 9: one entry per distinct category, each value = sum of amounts', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          amount:   fc.double({ min: 0.01, max: 1000, noNaN: true }),
          category: fc.constantFrom(...BUILTIN_CATEGORIES),
        }),
        { minLength: 0, maxLength: 100 }
      ),
      (txns) => {
        const result = computeChartData(txns, [], {});

        // One entry per distinct category that has transactions
        const distinctCats = [...new Set(txns.map(t => t.category))];
        if (result.labels.length !== distinctCats.length) return false;

        // Each entry's value equals the sum of amounts for that category
        for (let i = 0; i < result.labels.length; i++) {
          const cat      = result.labels[i];
          const expected = txns
            .filter(t => t.category === cat)
            .reduce((s, t) => s + t.amount, 0);
          if (Math.abs(result.data[i] - expected) > 1e-6) return false;
        }
        return true;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. groupByMonth
// ─────────────────────────────────────────────────────────────────────────────

describe('groupByMonth', () => {
  test('empty array → empty Map', () => {
    const result = groupByMonth([]);
    expect(result.size).toBe(0);
  });

  test('all same month → one key with all transactions', () => {
    const txns = [
      { date: '2024-03-15T10:00:00.000Z', amount: 10, category: 'Food' },
      { date: '2024-03-20T12:00:00.000Z', amount: 5,  category: 'Food' },
    ];
    const result = groupByMonth(txns);
    expect(result.size).toBe(1);
    expect(result.has('2024-03')).toBe(true);
    expect(result.get('2024-03').length).toBe(2);
  });

  test('different months → correct grouping', () => {
    const txns = [
      { date: '2024-01-10T00:00:00.000Z', amount: 10, category: 'Food' },
      { date: '2024-02-15T00:00:00.000Z', amount: 20, category: 'Transport' },
      { date: '2024-01-25T00:00:00.000Z', amount: 5,  category: 'Fun' },
    ];
    const result = groupByMonth(txns);
    expect(result.size).toBe(2);
    expect(result.get('2024-01').length).toBe(2);
    expect(result.get('2024-02').length).toBe(1);
  });

  // Feature: expense-budget-visualizer, Property 15: Monthly grouping is correct
  test('Property 15: each key matches YYYY-MM prefix of every transaction in its value', () => {
    // Date ISO string arbitrary that produces well-formed YYYY-MM-DDT... strings
    const isoDateArb = fc.date({
      min: new Date('2000-01-01'),
      max: new Date('2099-12-31'),
    }).map(d => d.toISOString());

    fc.assert(fc.property(
      fc.array(
        fc.record({
          date:     isoDateArb,
          amount:   fc.double({ min: 0.01, max: 1000, noNaN: true }),
          category: fc.constantFrom(...BUILTIN_CATEGORIES),
        }),
        { minLength: 0, maxLength: 100 }
      ),
      (txns) => {
        const grouped = groupByMonth(txns);

        // Every transaction appears in exactly one group
        let totalGrouped = 0;
        for (const [key, group] of grouped) {
          totalGrouped += group.length;
          // Each transaction in this group must have the right prefix
          for (const txn of group) {
            if (txn.date.slice(0, 7) !== key) return false;
          }
        }
        // Total grouped transactions equals total input transactions
        return totalGrouped === txns.length;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  8. computeMonthlySummary
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlySummary', () => {
  test('empty → []', () => {
    expect(computeMonthlySummary([], BUILTIN_CATEGORIES)).toEqual([]);
  });

  test('single month → one entry with correct totals', () => {
    const txns = [
      { date: '2024-05-01T00:00:00.000Z', amount: 10, category: 'Food' },
      { date: '2024-05-15T00:00:00.000Z', amount: 30, category: 'Food' },
      { date: '2024-05-20T00:00:00.000Z', amount: 15, category: 'Transport' },
    ];
    const result = computeMonthlySummary(txns, BUILTIN_CATEGORIES);
    expect(result.length).toBe(1);
    expect(result[0].month).toBe('2024-05');
    expect(result[0].totals['Food']).toBeCloseTo(40, 5);
    expect(result[0].totals['Transport']).toBeCloseTo(15, 5);
  });

  test('multiple months → sorted descending by month string', () => {
    const txns = [
      { date: '2024-01-10T00:00:00.000Z', amount: 10, category: 'Food' },
      { date: '2024-03-15T00:00:00.000Z', amount: 20, category: 'Food' },
      { date: '2024-02-20T00:00:00.000Z', amount: 5,  category: 'Fun' },
    ];
    const result = computeMonthlySummary(txns, BUILTIN_CATEGORIES);
    expect(result.length).toBe(3);
    expect(result[0].month).toBe('2024-03');
    expect(result[1].month).toBe('2024-02');
    expect(result[2].month).toBe('2024-01');
  });

  test('per-category totals are correct', () => {
    const txns = [
      { date: '2024-06-01T00:00:00.000Z', amount: 7,  category: 'Food' },
      { date: '2024-06-02T00:00:00.000Z', amount: 3,  category: 'Food' },
      { date: '2024-06-03T00:00:00.000Z', amount: 11, category: 'Fun' },
    ];
    const result = computeMonthlySummary(txns, BUILTIN_CATEGORIES);
    expect(result[0].totals['Food']).toBeCloseTo(10, 5);
    expect(result[0].totals['Fun']).toBeCloseTo(11, 5);
  });

  // Feature: expense-budget-visualizer, Property 16: Monthly summary totals and ordering are correct
  test('Property 16: per-category totals correct and entries in descending month order', () => {
    const isoDateArb = fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2024-12-31'),
    }).map(d => d.toISOString());

    fc.assert(fc.property(
      fc.array(
        fc.record({
          date:     isoDateArb,
          amount:   fc.double({ min: 0.01, max: 1000, noNaN: true }),
          category: fc.constantFrom(...BUILTIN_CATEGORIES),
        }),
        { minLength: 0, maxLength: 100 }
      ),
      (txns) => {
        const result = computeMonthlySummary(txns, BUILTIN_CATEGORIES);

        // Check descending order
        for (let i = 1; i < result.length; i++) {
          if (result[i - 1].month <= result[i].month) return false;
        }

        // Check per-category totals
        for (const entry of result) {
          for (const [cat, total] of Object.entries(entry.totals)) {
            const expected = txns
              .filter(t => t.date.slice(0, 7) === entry.month && t.category === cat)
              .reduce((s, t) => s + t.amount, 0);
            if (Math.abs(total - expected) > 1e-6) return false;
          }
        }
        return true;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  9. StorageService — saveTransaction + loadAll round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('StorageService — saveTransaction / loadAll round-trip', () => {
  beforeEach(() => { localStorageMock._reset(); });

  test('save then loadAll → transactions array contains the saved transaction', () => {
    const txn = {
      id: 'abc-123', name: 'Coffee', amount: 3.5,
      category: 'Food', date: new Date().toISOString(),
    };
    StorageService.saveTransaction(txn);
    const { transactions } = StorageService.loadAll();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual(txn);
  });

  // Feature: expense-budget-visualizer, Property 2: Valid transaction persists to storage
  test('Property 2: save+load round-trip preserves all transaction fields', () => {
    fc.assert(fc.property(
      validTransactionArb,
      (txn) => {
        localStorageMock._reset();
        StorageService.saveTransaction(txn);
        const { transactions } = StorageService.loadAll();
        if (transactions.length !== 1) return false;
        const loaded = transactions[0];
        return (
          loaded.id       === txn.id       &&
          loaded.name     === txn.name     &&
          loaded.amount   === txn.amount   &&
          loaded.category === txn.category &&
          loaded.date     === txn.date
        );
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  10. StorageService — removeTransaction + loadAll
// ─────────────────────────────────────────────────────────────────────────────

describe('StorageService — removeTransaction / loadAll', () => {
  beforeEach(() => { localStorageMock._reset(); });

  test('save 3, remove 1 → removed absent, others present', () => {
    const txns = [
      { id: 'id-1', name: 'A', amount: 1, category: 'Food',      date: new Date().toISOString() },
      { id: 'id-2', name: 'B', amount: 2, category: 'Transport', date: new Date().toISOString() },
      { id: 'id-3', name: 'C', amount: 3, category: 'Fun',       date: new Date().toISOString() },
    ];
    for (const txn of txns) StorageService.saveTransaction(txn);

    StorageService.removeTransaction('id-2');
    const { transactions } = StorageService.loadAll();

    expect(transactions.some(t => t.id === 'id-2')).toBe(false);
    expect(transactions.some(t => t.id === 'id-1')).toBe(true);
    expect(transactions.some(t => t.id === 'id-3')).toBe(true);
    expect(transactions).toHaveLength(2);
  });

  // Feature: expense-budget-visualizer, Property 7: Delete removes transaction from storage
  test('Property 7: after removeTransaction(id), loadAll never contains that id', () => {
    fc.assert(fc.property(
      fc.array(validTransactionArb, { minLength: 1, maxLength: 10 }),
      fc.integer({ min: 0, max: 9 }),
      (txns, rawIdx) => {
        localStorageMock._reset();
        // Ensure unique ids
        const uniqueTxns = txns.map((t, i) => ({ ...t, id: `uid-${i}` }));
        for (const txn of uniqueTxns) StorageService.saveTransaction(txn);

        const idx = rawIdx % uniqueTxns.length;
        const targetId = uniqueTxns[idx].id;
        StorageService.removeTransaction(targetId);

        const { transactions } = StorageService.loadAll();

        // Removed transaction must be gone
        if (transactions.some(t => t.id === targetId)) return false;
        // All others must still be present
        for (const t of uniqueTxns) {
          if (t.id !== targetId && !transactions.some(loaded => loaded.id === t.id)) {
            return false;
          }
        }
        return true;
      }
    ), { numRuns: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  11. Category selector completeness (Property 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Category selector completeness', () => {
  // Feature: expense-budget-visualizer, Property 1: Category selector completeness
  test('Property 1: combined array contains exactly 3 built-ins + all custom names, no duplicates', () => {
    // Arbitrary for a valid custom category name: 1–50 chars, not a case-insensitive match
    // of any built-in.  We generate the array as a Set-of-strings to guarantee uniqueness
    // within the generated list itself.
    const validCustomNameArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .map(s => s.trim())
      .filter(
        s =>
          s.length > 0 &&
          s.length <= MAX_CUSTOM_CAT_NAME_LENGTH &&
          !BUILTIN_CATEGORIES.some(b => b.toLowerCase() === s.toLowerCase())
      );

    fc.assert(
      fc.property(
        // Generate up to MAX_CUSTOM_CATEGORIES distinct custom names
        fc
          .array(validCustomNameArb, { minLength: 0, maxLength: MAX_CUSTOM_CATEGORIES })
          .map(arr => {
            // De-duplicate case-insensitively to mimic what the app enforces
            const seen = new Set();
            return arr.filter(name => {
              const key = name.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }),
        (customCategories) => {
          const combined = [...BUILTIN_CATEGORIES, ...customCategories];

          // 1. Must contain all three built-ins
          for (const builtin of BUILTIN_CATEGORIES) {
            if (!combined.includes(builtin)) return false;
          }

          // 2. Must contain every custom name
          for (const custom of customCategories) {
            if (!combined.includes(custom)) return false;
          }

          // 3. Total length must be exactly 3 + custom count
          if (combined.length !== BUILTIN_CATEGORIES.length + customCategories.length) return false;

          // 4. No duplicates (case-sensitive equality, which is guaranteed by construction
          //    since built-ins are filtered out case-insensitively above)
          const uniqueSet = new Set(combined);
          return uniqueSet.size === combined.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  12. StorageService — custom-category reload round-trip (Property 14)
// ─────────────────────────────────────────────────────────────────────────────

describe('StorageService — saveCustomCategories / loadAll round-trip', () => {
  beforeEach(() => { localStorageMock._reset(); });

  test('save then loadAll → customCategories contains all saved names', () => {
    const cats = ['Hobbies', 'Gym', 'Pets'];
    StorageService.saveCustomCategories(cats);
    const { customCategories } = StorageService.loadAll();
    expect(customCategories).toEqual(cats);
  });

  // Feature: expense-budget-visualizer, Property 14: Custom categories survive a reload round-trip
  test('Property 14: any valid custom category array survives a saveCustomCategories → loadAll round-trip', () => {
    const validCustomNameArb = fc
      .string({ minLength: 1, maxLength: MAX_CUSTOM_CAT_NAME_LENGTH })
      .map(s => s.trim())
      .filter(s => s.length > 0);

    fc.assert(
      fc.property(
        // Generate 0–50 arbitrary custom category name strings
        fc
          .array(validCustomNameArb, { minLength: 0, maxLength: MAX_CUSTOM_CATEGORIES })
          .map(arr => {
            // Keep only the first occurrence of each name (case-sensitive) to avoid
            // confusion — the app itself prevents duplicates before saving
            const seen = new Set();
            return arr.filter(name => {
              if (seen.has(name)) return false;
              seen.add(name);
              return true;
            });
          }),
        (customCategories) => {
          localStorageMock._reset();

          StorageService.saveCustomCategories(customCategories);
          const { customCategories: loaded, errors } = StorageService.loadAll();

          // No errors should be reported for this key
          if (errors.customCategories) return false;

          // Loaded array must have the same length
          if (loaded.length !== customCategories.length) return false;

          // Every saved name must be present in the same position (order preserved)
          for (let i = 0; i < customCategories.length; i++) {
            if (loaded[i] !== customCategories[i]) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
