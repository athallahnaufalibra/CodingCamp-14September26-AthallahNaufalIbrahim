# Design Document: Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a fully client-side web application built with plain HTML, a single CSS file, and a single JavaScript file. It lets users record personal expense transactions, view a running total balance, browse a reverse-chronological transaction list, and explore a live Chart.js pie chart of spending by category.

All data is stored in the browser's `localStorage`; no backend, build step, or external dependency beyond Chart.js (loaded via CDN) is required. The app ships as a self-contained directory that works both as a standalone HTML page opened directly from the filesystem and as an unpacked Chrome/Firefox/Edge browser extension.

Additional features layered on top of the core include user-defined custom categories, a togglable monthly summary panel, and per-category spending-limit alerts with visual highlights in both the transaction list and the pie chart.

### Key Design Goals

- **Zero-framework simplicity** — one HTML file, one CSS file, one JS file; no build toolchain.
- **Correctness-first persistence** — writes to `localStorage` before any UI mutation so the UI always reflects durable state.
- **Live reactivity** — a single `render()` pass re-derives all UI state from the in-memory transaction array after every mutation, keeping components in sync without manual bookkeeping.
- **Graceful degradation** — every `localStorage` access is wrapped in try/catch; failures produce visible, dismissible notifications but never corrupt the in-memory state.

---

## Architecture

The app uses a simple **Model → Render** loop. There is no virtual DOM, no reactive framework, and no component lifecycle. The entire UI is re-derived from a single canonical in-memory state object on every mutation.

```
┌────────────────────────────────────────────────────────────────┐
│                        index.html                              │
│  ┌────────────────┐   ┌──────────────────────────────────────┐ │
│  │  css/style.css │   │           js/app.js                  │ │
│  └────────────────┘   │                                      │ │
│                       │  ┌──────────────────────────────┐   │ │
│                       │  │         AppState              │   │ │
│                       │  │  transactions[]               │   │ │
│                       │  │  customCategories[]           │   │ │
│                       │  │  spendingLimits{}             │   │ │
│                       │  └──────────────┬───────────────┘   │ │
│                       │                 │                    │ │
│                       │         render() called              │ │
│                       │          after every write           │ │
│                       │                 │                    │ │
│                       │  ┌──────────────▼───────────────┐   │ │
│                       │  │      UI Renderer              │   │ │
│                       │  │  renderBalance()              │   │ │
│                       │  │  renderTransactionList()      │   │ │
│                       │  │  renderChart()                │   │ │
│                       │  │  renderMonthlySummary()       │   │ │
│                       │  │  renderAlerts()               │   │ │
│                       │  └──────────────────────────────┘   │ │
│                       │                                      │ │
│                       │  ┌──────────────────────────────┐   │ │
│                       │  │      StorageService           │   │ │
│                       │  │  save / load / remove         │   │ │
│                       │  │  (all try/catch wrapped)      │   │ │
│                       │  └──────────────────────────────┘   │ │
│                       └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
             ▲ CDN script tag
     Chart.js (pinned version)
```

### Execution Flow

1. **Page load** — `StorageService.loadAll()` reads `localStorage`; any parse errors are caught and reported. `AppState` is populated. `render()` runs once.
2. **User mutation** (add/delete/edit transaction, add category, set limit) — `StorageService.save*()` writes to `localStorage` first. On success, `AppState` is updated in memory and `render()` is called. On `localStorage` failure the in-memory state is **not** mutated and an error notification is shown.
3. **render()** — a pure, idempotent function that derives all DOM content from `AppState`. Calling it twice in a row produces the same result.

### File Layout

```
expense-budget-visualizer/
├── index.html          ← entry point; loads Chart.js CDN, css/style.css, js/app.js
├── css/
│   └── style.css       ← all styles; CSS custom properties for theming/alerts
├── js/
│   └── app.js          ← all application logic
└── manifest.json       ← optional; enables browser-extension deployment
```

---

## Components and Interfaces

All components are plain DOM elements manipulated by `js/app.js`. The following describes each logical component, the DOM structure it manages, and the JavaScript functions responsible for it.

### 1. Input Form

**DOM:** `<form id="txn-form">` containing `#item-name`, `#amount`, `#category`, `#add-btn`, and inline `<span class="error">` elements for each field.

**Functions:**
- `handleFormSubmit(event)` — reads form values, calls `Validator.validateTransaction(name, amount, category)`, on success calls `StorageService.saveTransaction(txn)`, updates `AppState.transactions`, calls `render()`, resets form.
- `Validator.validateTransaction(name, amount, category)` → `{ valid: boolean, errors: { name?, amount?, category? } }` — pure function, no side effects.

**Behaviour:**
- Item Name: `maxlength="100"`, `required`.
- Amount: `type="number"`, `min="0.01"`, `max="999999999.99"`, `step="0.01"`, `required`. The validator additionally checks for non-numeric strings entered programmatically.
- Category: `<select>` populated from `[...BUILTIN_CATEGORIES, ...AppState.customCategories]`.
- On successful save, form resets: `name=''`, `amount=''`, `category='Food'`.

### 2. Transaction List

**DOM:** `<ul id="txn-list">` inside a scrollable `<div id="txn-list-wrapper">` (CSS `overflow-y: auto; max-height: …`).

**Functions:**
- `renderTransactionList()` — derives display list from `AppState.transactions` (sorted descending by date, capped at 500 for rendering), creates `<li>` elements with `data-id` attributes, applies alert CSS classes.
- `handleDeleteClick(id)` — called on delete button click; calls `StorageService.removeTransaction(id)`, splices `AppState.transactions`, calls `render()`.

**Behaviour:**
- Each `<li>` shows: Item Name, Amount (currency), Category, Date (locale string).
- Each `<li>` has a `<button class="delete-btn">` triggering `handleDeleteClick`.
- If the list is empty, renders `<li class="empty-state">No transactions recorded.</li>`.
- If `AppState.transactions.length > 500`, `renderTransactionList()` renders the 500 most recent; balance still uses all transactions.
- Alert highlight CSS class `txn-alert` applied to all rows of a category when that category's total ≥ its `spendingLimits` value.

### 3. Total Balance

**DOM:** `<span id="balance-display">` inside a fixed header/summary bar.

**Functions:**
- `computeBalance(transactions)` → `number` — pure function; `transactions.reduce((sum, t) => sum + t.amount, 0)`.
- `renderBalance()` — calls `computeBalance(AppState.transactions)`, formats with `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, writes to DOM.

**Behaviour:** Always computed from the full `AppState.transactions` array (not capped at 500).

### 4. Spending Chart

**DOM:** `<canvas id="spending-chart">` wrapped in `<div id="chart-wrapper">`. A `<p id="chart-placeholder">` is shown/hidden based on data availability.

**Functions:**
- `computeChartData(transactions, customCategories, spendingLimits)` → `{ labels: string[], data: number[], colors: string[] }` — pure function.
- `renderChart()` — calls `computeChartData`, updates or creates the `Chart` instance. If no data, hides canvas and shows placeholder.
- `getCategoryColor(category, isOverLimit)` → `string` — returns a deterministic hex color for the category; returns the alert color if `isOverLimit`.

**Behaviour:**
- One pie segment per category that has at least one transaction.
- Segment value = sum of all transaction amounts in that category.
- Each category gets a unique color from a deterministic palette (cycled by index); no two categories share the same default color.
- When a category's total ≥ its spending limit, `getCategoryColor` returns the alert color (e.g. `#e74c3c`) instead of the default.
- Chart.js instance is reused across renders by calling `chart.data = …; chart.update()` rather than destroying and recreating.

### 5. Custom Categories

**DOM:** `<input id="custom-cat-input">`, `<button id="add-cat-btn">`, inline `<span id="custom-cat-error">`.

**Functions:**
- `handleAddCategory()` — reads input, calls `Validator.validateCategory(name, existingCategories)`, on success calls `StorageService.saveCustomCategories(updated)`, updates `AppState.customCategories`, calls `render()`.
- `Validator.validateCategory(name, existing)` → `{ valid: boolean, error?: string }` — pure function checking: non-empty, ≤ 50 chars, not a case-insensitive duplicate, and `existing.length < 50`.

### 6. Monthly Summary View

**DOM:** `<section id="monthly-summary">` toggled visible/hidden by `<button id="toggle-summary-btn">`. Contains a generated table or list of months.

**Functions:**
- `groupByMonth(transactions)` → `Map<string, Transaction[]>` — pure function; key is `'YYYY-MM'` derived from `transaction.date`.
- `computeMonthlySummary(transactions, categories)` → `Array<{ month: string, totals: Record<string, number> }>` — pure function; sorted descending by month string.
- `renderMonthlySummary()` — calls `computeMonthlySummary`, builds DOM table, shows no-data message if result is empty.

**Behaviour:**
- Summary is always computed from the full `AppState.transactions` (not capped).
- Visible state is tracked in `AppState.summaryVisible` (boolean); `render()` conditionally calls `renderMonthlySummary()`.
- Re-renders automatically when `render()` is called after any mutation.

### 7. Spending Limit Settings

**DOM:** Per-category controls rendered inside a `<div id="limit-settings">` panel, toggled by a button. Each row: category label + `<input type="number">` + Save + Clear buttons.

**Functions:**
- `handleSaveLimit(category, value)` — calls `Validator.validateSpendingLimit(value)`, on success calls `StorageService.saveSpendingLimits(updated)`, updates `AppState.spendingLimits`, calls `render()`.
- `handleClearLimit(category)` — removes entry from `AppState.spendingLimits`, calls `StorageService.saveSpendingLimits(updated)`, calls `render()`.
- `Validator.validateSpendingLimit(value)` → `{ valid: boolean, error?: string }` — rejects empty, non-numeric, ≤ 0, or > 999,999,999.99.

### 8. Storage Service

All `localStorage` access is isolated in `StorageService`:

```js
const StorageService = {
  KEYS: {
    TRANSACTIONS: 'ebv_transactions',
    CUSTOM_CATS:  'ebv_custom_categories',
    LIMITS:       'ebv_spending_limits',
  },
  loadAll()             // → { transactions, customCategories, spendingLimits }
  saveTransaction(txn)  // → void; throws on localStorage error
  removeTransaction(id) // → void; throws on localStorage error
  saveCustomCategories(arr) // → void
  saveSpendingLimits(obj)   // → void
}
```

All methods that write call `JSON.stringify` and `localStorage.setItem` inside a try/catch. The caller is responsible for catching and displaying errors via `showNotification(message)`.

### 9. Notification System

**DOM:** `<div id="notification-bar" role="alert">` at the top of the page, hidden by default.

**Functions:**
- `showNotification(message)` — shows the bar with the given message. Adds a dismiss `×` button.
- `dismissNotification()` — hides the bar.

Notifications are persistent (do not auto-dismiss) per requirements 5.4 and 5.5.

---

## Data Models

All data is serialized to JSON for `localStorage`.

### Transaction

```js
{
  id:       string,   // crypto.randomUUID() or Date.now().toString() fallback
  name:     string,   // 1–100 characters
  amount:   number,   // 0.01 – 999,999,999.99; stored as float
  category: string,   // one of BUILTIN_CATEGORIES or customCategories
  date:     string,   // ISO 8601: new Date().toISOString()
}
```

### AppState

```js
const AppState = {
  transactions:      Transaction[],        // full ordered array (insertion order; render sorts)
  customCategories:  string[],             // max 50 entries, max 50 chars each
  spendingLimits:    Record<string, number>, // { "Food": 200.00, … }
  summaryVisible:    boolean,
  limitPanelVisible: boolean,
  chartInstance:     Chart | null,         // Chart.js instance (not persisted)
}
```

### localStorage Schema

| Key | Type | Description |
|---|---|---|
| `ebv_transactions` | `Transaction[]` JSON | All transactions |
| `ebv_custom_categories` | `string[]` JSON | User-defined category names |
| `ebv_spending_limits` | `Record<string,number>` JSON | Per-category spending limits |

### Constants

```js
const BUILTIN_CATEGORIES = ['Food', 'Transport', 'Fun'];
const MAX_ITEM_NAME_LENGTH = 100;
const MAX_AMOUNT = 999_999_999.99;
const MIN_AMOUNT = 0.01;
const MAX_CUSTOM_CAT_NAME_LENGTH = 50;
const MAX_CUSTOM_CATEGORIES = 50;
const MAX_RENDERED_TRANSACTIONS = 500;

// Deterministic color palette (≥ 53 distinct colors to cover 3 builtins + 50 custom)
const CATEGORY_COLORS = [ /* …array of hex strings… */ ];
const ALERT_COLOR = '#e74c3c';
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Category selector completeness

*For any* array of valid custom category names that have been added to the app, the category selector options should contain exactly the three built-in categories (Food, Transport, Fun) plus every added custom category name, with no duplicates.

**Validates: Requirements 1.2**

---

### Property 2: Valid transaction persists to storage

*For any* valid transaction (item name of 1–100 chars, amount of 0.01–999,999,999.99, category from the available set), submitting the form should result in a transaction with matching name, amount, and category being present in `localStorage` and in the rendered transaction list.

**Validates: Requirements 1.3, 5.1**

---

### Property 3: Incomplete form is rejected

*For any* form submission where at least one required field (name, amount, category) is empty or missing, the validator should return a non-empty errors object identifying each missing field, and no new transaction should be present in storage.

**Validates: Requirements 1.4**

---

### Property 4: Invalid amount is rejected

*For any* amount value that is zero, negative, non-numeric, or greater than 999,999,999.99, the validator should return an amount error and no transaction should be saved.

**Validates: Requirements 1.5**

---

### Property 5: Transaction list displays all required fields

*For any* non-empty array of transactions stored in the app, each rendered list row should display the item name, amount (currency-formatted), category, and date of its corresponding transaction.

**Validates: Requirements 2.1**

---

### Property 6: Transaction list is sorted descending by date

*For any* array of transactions with varied dates, the rendered transaction list should display them in descending date order (most recent date first).

**Validates: Requirements 2.3**

---

### Property 7: Delete removes transaction from storage and list

*For any* stored transaction list and any transaction within it, after triggering the delete action for that transaction, the transaction should be absent from both `localStorage` and the rendered list, and all other transactions should remain unchanged.

**Validates: Requirements 2.4, 5.3**

---

### Property 8: Balance equals sum of all transaction amounts

*For any* array of transactions, the displayed balance should equal the precise arithmetic sum of all transaction amounts, formatted as a currency value with exactly two decimal places.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5**

---

### Property 9: Chart data reflects per-category totals

*For any* array of transactions grouped by category, the chart data object produced by `computeChartData` should contain exactly one entry per category that has at least one transaction, and each entry's value should equal the sum of all transaction amounts in that category.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 10: Category colors are unique

*For any* set of N distinct category names (N ≥ 1), the color array generated by the color assignment function should contain N values with no two values equal.

**Validates: Requirements 4.5**

---

### Property 11: Valid custom category is added and persisted

*For any* string of 1–50 characters that does not case-insensitively duplicate an existing category and when the current custom category count is below 50, submitting it should add it to `AppState.customCategories`, to the category selector, and to `localStorage`.

**Validates: Requirements 6.2**

---

### Property 12: Oversized custom category name is rejected

*For any* string with length greater than 50 characters, the category validator should return an error and not add the category.

**Validates: Requirements 6.3**

---

### Property 13: Duplicate category name is rejected (case-insensitive)

*For any* existing category name and any capitalization variant of it, the category validator should return a duplicate error and not add the category.

**Validates: Requirements 6.5**

---

### Property 14: Custom categories survive a reload round-trip

*For any* set of valid custom categories persisted to `localStorage`, initializing the app (calling `StorageService.loadAll()` and rendering) should restore all of them in the category selector.

**Validates: Requirements 6.7**

---

### Property 15: Monthly grouping is correct

*For any* array of transactions with varied dates, the `groupByMonth` function should produce a map where each key is a `YYYY-MM` string and each value array contains only transactions whose ISO date string starts with that `YYYY-MM` prefix.

**Validates: Requirements 7.1**

---

### Property 16: Monthly summary totals and ordering are correct

*For any* array of transactions, `computeMonthlySummary` should return an array where: (a) each entry's per-category totals equal the sum of amounts for transactions in that month and category, and (b) entries are sorted in descending month order (most recent `YYYY-MM` first).

**Validates: Requirements 7.2**

---

### Property 17: Valid spending limit is persisted

*For any* valid spending limit value (0.01–999,999,999.99) saved for any category, the value should be stored in `localStorage` under the correct category key and reflected in `AppState.spendingLimits`.

**Validates: Requirements 8.2**

---

### Property 18: Spending limit alert state is correct

*For any* combination of transaction amounts for a category and a spending limit for that category, the alert state (highlighted/not-highlighted) for that category should be `true` if and only if the sum of the category's transaction amounts is greater than or equal to the spending limit. This alert state drives both row background colors in the transaction list and the chart segment color.

**Validates: Requirements 8.3, 8.4, 8.5**

---

### Property 19: Invalid spending limit is rejected

*For any* spending limit value that is empty, non-numeric, zero, or negative, the spending limit validator should return an error and not save the value.

**Validates: Requirements 8.6**

---

### Property 20: Render cap preserves balance correctness

*For any* transaction list of size N greater than 500, the `renderTransactionList` function should render at most 500 items (the N most recent by date), while `computeBalance` called on the full array should return the sum of all N transaction amounts.

**Validates: Requirements 10.5**

---

## Error Handling

### LocalStorage Failures

All `localStorage` operations are wrapped in try/catch. The `StorageService` methods throw on failure; callers catch and route to `showNotification()`.

| Scenario | Behavior |
|---|---|
| `setItem` throws on write | In-memory state is **not** mutated; persistent notification shown |
| `getItem` throws on load | `AppState` initializes empty; persistent notification shown |
| `JSON.parse` fails on load | Malformed data discarded; `AppState` initializes empty; persistent notification shown |
| `removeItem` throws on delete | Transaction remains in list; persistent notification shown |
| Custom categories storage corrupt | `customCategories` initializes empty; persistent notification shown |

Notifications use `role="alert"` for accessibility and remain visible until the user explicitly dismisses them.

### Validator Errors

All validation errors are inline — displayed next to the relevant field via `<span class="error">` elements. Errors are cleared on each new submission attempt.

### Chart.js Failures

If Chart.js fails to load (e.g., CDN unavailable), the canvas element is hidden and a static fallback message is shown in its place. The rest of the app continues to function.

### Graceful Unknown Categories

If a loaded transaction references a category not in the current category list (e.g., a custom category was deleted externally), the category value is preserved as-is and displayed literally. It does not crash the app.

---

## Testing Strategy

This feature targets property-based testing using **fast-check** (JavaScript) for universal properties, complemented by example-based unit tests for specific scenarios and edge cases.

### Testing Layers

#### Unit / Property Tests (js/app.test.js or similar)

Pure functions (validators, `computeBalance`, `computeChartData`, `groupByMonth`, `computeMonthlySummary`, `getCategoryColor`) have no DOM or localStorage dependencies and are directly testable.

**Property-based tests** (minimum 100 iterations each):

| Test | Property | Validates |
|---|---|---|
| Category selector contains all categories | Property 1 | Req 1.2 |
| Valid transaction saved to storage | Property 2 | Req 1.3, 5.1 |
| Incomplete form rejected | Property 3 | Req 1.4 |
| Invalid amount rejected | Property 4 | Req 1.5 |
| Transaction list displays all fields | Property 5 | Req 2.1 |
| Transaction list sorted descending | Property 6 | Req 2.3 |
| Delete removes from storage+list | Property 7 | Req 2.4, 5.3 |
| Balance equals sum of amounts | Property 8 | Req 3.1–3.3, 3.5 |
| Chart data per-category totals | Property 9 | Req 4.1–4.3 |
| Category colors unique | Property 10 | Req 4.5 |
| Valid custom category added | Property 11 | Req 6.2 |
| Oversized name rejected | Property 12 | Req 6.3 |
| Duplicate name rejected (case-insensitive) | Property 13 | Req 6.5 |
| Custom categories restore on reload | Property 14 | Req 6.7 |
| Monthly grouping correct | Property 15 | Req 7.1 |
| Monthly summary totals and order | Property 16 | Req 7.2 |
| Valid spending limit persisted | Property 17 | Req 8.2 |
| Spending limit alert state correct | Property 18 | Req 8.3–8.5 |
| Invalid spending limit rejected | Property 19 | Req 8.6 |
| Render cap with full balance | Property 20 | Req 10.5 |

Each property test is tagged with a comment:
```js
// Feature: expense-budget-visualizer, Property 8: Balance equals sum of all transaction amounts
```

**Example-based unit tests:**

- Form resets after successful save (Req 1.6)
- Empty transaction list shows empty-state message (Req 2.5)
- LocalStorage unavailable on delete shows error; list unchanged (Req 2.6)
- Balance displays `0.00` when no transactions exist (Req 3.4)
- Chart shows placeholder when no transactions exist (Req 4.4, 4.6)
- App loads and renders from pre-populated `localStorage` (Req 5.2)
- `localStorage` write failure shows persistent notification (Req 5.4)
- `localStorage` read failure at load shows notification; initializes empty (Req 5.5)
- Malformed `localStorage` data shows notification; initializes empty (Req 5.6)
- Custom category input UI exists with maxlength constraint (Req 6.1)
- Empty custom category name shows error (Req 6.4)
- 50 custom categories limit enforced (Req 6.6)
- Corrupt custom category data shows notification; initializes empty (Req 6.8)
- Monthly summary opens/closes on toggle (Req 7.3–7.4 reactivity)
- Monthly summary shows no-data message when empty (Req 7.5)
- Spending limit input field exists with correct constraints (Req 8.1)
- Clearing a spending limit removes it from storage and removes highlight (Req 8.7)
- Text contrast CSS properties meet minimum thresholds (Req 10.3)

#### Smoke / Integration Tests

- File structure: `index.html`, `css/style.css`, `js/app.js` exist (Req 9.3)
- `manifest.json` is valid JSON if present (Req 9.2)
- Benchmark: load with 500 pre-populated transactions completes within 1 second (Req 10.1)
- Benchmark: add/delete updates complete within 200ms (Req 10.2)
- Viewport smoke test at 320px, 768px, 1280px, 1920px (Req 10.4)
- Cross-browser manual test checklist: Chrome, Firefox, Edge, Safari (Req 9.1)

### Property Test Library

**fast-check** is used for property-based testing. Each property test runs a minimum of 100 iterations via `fc.assert(fc.property(…), { numRuns: 100 })`.

Generator examples:
- `fc.string({ minLength: 1, maxLength: 100 })` for item names
- `fc.float({ min: 0.01, max: 999_999_999.99 })` for amounts
- `fc.constantFrom(...BUILTIN_CATEGORIES)` for categories
- `fc.array(transactionArbitrary, { minLength: 0, maxLength: 600 })` for transaction lists
- `fc.string({ minLength: 1, maxLength: 50 })` for custom category names

`localStorage` is mocked in all unit/property tests to prevent actual browser storage access and to enable error injection.
