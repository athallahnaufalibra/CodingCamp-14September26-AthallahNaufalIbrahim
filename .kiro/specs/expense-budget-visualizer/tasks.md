# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a fully client-side expense tracking web app using plain HTML, a single CSS file (`css/style.css`), and a single JavaScript file (`js/app.js`). The app follows a Model → Render loop: every mutation writes to `localStorage` first, updates `AppState`, then calls a single `render()` pass to re-derive the entire UI. Chart.js is loaded via CDN. The deliverable must run as a standalone HTML file and optionally as an unpacked browser extension.

---

## Tasks

- [x] 1. Scaffold project structure and base HTML
  - [x] 1.1 Create the file skeleton: `index.html`, `css/style.css`, `js/app.js`, and `manifest.json`
    - `index.html`: standard HTML5 boilerplate; `<link>` to `css/style.css`; `<script>` tag loading Chart.js from CDN (pinned version, e.g. `4.x`); `<script src="js/app.js" defer>`
    - `manifest.json`: minimal browser-extension manifest (name, version, manifest_version 3, `default_popup` pointing to `index.html`)
    - `css/style.css`: empty file with a top comment; add CSS custom properties for default and alert colors (`--color-alert: #e74c3c`)
    - `js/app.js`: empty file with a top comment
    - _Requirements: 9.2, 9.3_

  - [x] 1.2 Build the static HTML skeleton inside `index.html`
    - Notification bar: `<div id="notification-bar" role="alert" hidden>` with an inner `<span id="notification-msg">` and a `<button id="notification-dismiss">×</button>`
    - Summary bar: `<header>` containing `<span id="balance-display">` and a `<button id="toggle-summary-btn">Monthly Summary</button>` and a `<button id="toggle-limits-btn">Spending Limits</button>`
    - Input form: `<form id="txn-form">` with `#item-name` (`maxlength="100"`, `required`), `#amount` (`type="number"`, `min="0.01"`, `max="999999999.99"`, `step="0.01"`, `required`), `#category` (`<select>`), `<button id="add-btn">Add</button>`, and one `<span class="error">` per field
    - Custom category UI: `<input id="custom-cat-input" maxlength="50">`, `<button id="add-cat-btn">Add Category</button>`, `<span id="custom-cat-error">`
    - Transaction list: `<div id="txn-list-wrapper">` containing `<ul id="txn-list">`
    - Chart: `<div id="chart-wrapper">` containing `<canvas id="spending-chart">` and `<p id="chart-placeholder">`
    - Monthly summary: `<section id="monthly-summary" hidden>`
    - Spending limits panel: `<div id="limit-settings" hidden>`
    - _Requirements: 1.1, 2.2, 3.1, 4.1, 6.1, 7.1, 8.1_

- [x] 2. Implement constants, AppState, and StorageService in `js/app.js`
  - [x] 2.1 Define constants and `AppState`
    - Declare `BUILTIN_CATEGORIES`, `MAX_ITEM_NAME_LENGTH` (100), `MAX_AMOUNT` (999_999_999.99), `MIN_AMOUNT` (0.01), `MAX_CUSTOM_CAT_NAME_LENGTH` (50), `MAX_CUSTOM_CATEGORIES` (50), `MAX_RENDERED_TRANSACTIONS` (500)
    - Declare `CATEGORY_COLORS` array with ≥ 53 unique hex strings; declare `ALERT_COLOR = '#e74c3c'`
    - Declare `AppState`: `{ transactions: [], customCategories: [], spendingLimits: {}, summaryVisible: false, limitPanelVisible: false, chartInstance: null }`
    - _Requirements: 1.2, 4.5, 6.6, 10.5_

  - [x] 2.2 Implement `StorageService`
    - Define `StorageService.KEYS` (`ebv_transactions`, `ebv_custom_categories`, `ebv_spending_limits`)
    - Implement `loadAll()`: reads all three keys; wraps each `getItem` + `JSON.parse` in try/catch; returns `{ transactions, customCategories, spendingLimits }`; on per-key failure returns safe default (`[]` or `{}`) and records which keys errored
    - Implement `saveTransaction(txn)`: reads current array, pushes `txn`, `JSON.stringify`s, calls `setItem`; throws on error
    - Implement `removeTransaction(id)`: reads current array, filters out `id`, writes back; throws on error
    - Implement `saveCustomCategories(arr)`: `setItem` with stringified array; throws on error
    - Implement `saveSpendingLimits(obj)`: `setItem` with stringified object; throws on error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.3 Write property test for `StorageService` round-trip (Property 2, Property 7)
    - **Property 2: Valid transaction persists to storage** — for any valid transaction, `saveTransaction` followed by a fresh `loadAll` should return an array containing that transaction
    - **Property 7: Delete removes transaction from storage** — after `removeTransaction(id)`, `loadAll` should not contain any transaction with that id; all other transactions remain
    - **Validates: Requirements 1.3, 5.1, 2.4, 5.3**
    - Use `fast-check`; mock `localStorage` with a simple in-memory object; run ≥ 100 iterations

- [x] 3. Implement Validator pure functions
  - [x] 3.1 Implement `Validator.validateTransaction(name, amount, category)`
    - Returns `{ valid: boolean, errors: { name?, amount?, category? } }`
    - Name: error if empty or length > 100
    - Amount: error if empty, non-numeric, ≤ 0, or > 999,999,999.99
    - Category: error if falsy / not in known categories (pass available categories as a fourth parameter or check against `AppState`)
    - _Requirements: 1.4, 1.5_

  - [ ]* 3.2 Write property tests for `validateTransaction` (Properties 3, 4)
    - **Property 3: Incomplete form is rejected** — for any submission missing ≥ 1 required field, `valid` is `false` and `errors` is non-empty
    - **Property 4: Invalid amount is rejected** — for amounts = 0, < 0, non-numeric strings, or > 999,999,999.99, `errors.amount` is set
    - **Validates: Requirements 1.4, 1.5**

  - [x] 3.3 Implement `Validator.validateCategory(name, existing)`
    - Returns `{ valid: boolean, error?: string }`
    - Rejects: empty string, length > 50, case-insensitive duplicate of any entry in `existing`, or `existing.length >= 50`
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

  - [ ]* 3.4 Write property tests for `validateCategory` (Properties 12, 13)
    - **Property 12: Oversized custom category name is rejected** — any string with length > 50 returns an error
    - **Property 13: Duplicate category name is rejected (case-insensitive)** — any capitalization variant of an existing category name returns a duplicate error
    - **Validates: Requirements 6.3, 6.5**

  - [x] 3.5 Implement `Validator.validateSpendingLimit(value)`
    - Returns `{ valid: boolean, error?: string }`
    - Rejects: empty string, non-numeric, ≤ 0, or > 999,999,999.99
    - _Requirements: 8.6_

  - [ ]* 3.6 Write property test for `validateSpendingLimit` (Property 19)
    - **Property 19: Invalid spending limit is rejected** — empty, non-numeric, zero, and negative inputs all return an error
    - **Validates: Requirements 8.6**

- [x] 4. Implement pure compute functions
  - [x] 4.1 Implement `computeBalance(transactions)`
    - `transactions.reduce((sum, t) => sum + t.amount, 0)`; returns `number`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.2 Write property test for `computeBalance` (Property 8)
    - **Property 8: Balance equals sum of all transaction amounts** — for any array of transactions, `computeBalance` returns the precise arithmetic sum; formatted result has exactly two decimal places
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**

  - [x] 4.3 Implement `getCategoryColor(category, isOverLimit)`
    - Accepts a category name string and a boolean; returns `ALERT_COLOR` when `isOverLimit` is `true`, otherwise returns the color at `CATEGORY_COLORS[categoryIndex % CATEGORY_COLORS.length]` where `categoryIndex` is the stable index of the category in the combined `[...BUILTIN_CATEGORIES, ...AppState.customCategories]` array
    - _Requirements: 4.5, 8.4_

  - [ ]* 4.4 Write property test for category color uniqueness (Property 10)
    - **Property 10: Category colors are unique** — for any set of N distinct category names (N ≥ 1, N ≤ 53), the color array returned by mapping `getCategoryColor` over all names should contain N values with no two equal (when `isOverLimit` is `false` for all)
    - **Validates: Requirements 4.5**

  - [x] 4.5 Implement `computeChartData(transactions, customCategories, spendingLimits)`
    - Returns `{ labels: string[], data: number[], colors: string[] }`
    - Builds per-category total map; includes only categories with at least one transaction; derives `isOverLimit` per category; maps colors via `getCategoryColor`
    - _Requirements: 4.1, 4.2, 4.3, 8.3, 8.4_

  - [ ]* 4.6 Write property test for `computeChartData` (Property 9)
    - **Property 9: Chart data reflects per-category totals** — for any array of transactions, `computeChartData` returns exactly one entry per category with at least one transaction, and each entry's value equals the sum of amounts in that category
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 4.7 Implement `groupByMonth(transactions)` and `computeMonthlySummary(transactions, categories)`
    - `groupByMonth`: returns `Map<string, Transaction[]>` keyed by `'YYYY-MM'` prefix of `transaction.date`
    - `computeMonthlySummary`: uses `groupByMonth` to build `Array<{ month: string, totals: Record<string, number> }>` sorted descending by month string
    - _Requirements: 7.1, 7.2_

  - [ ]* 4.8 Write property tests for `groupByMonth` and `computeMonthlySummary` (Properties 15, 16)
    - **Property 15: Monthly grouping is correct** — each key in the result map matches the `YYYY-MM` prefix of every transaction in its value array, and every transaction appears in exactly one group
    - **Property 16: Monthly summary totals and ordering are correct** — per-category totals match the sum of amounts; entries are in descending month order
    - **Validates: Requirements 7.1, 7.2**

- [x] 5. Checkpoint — Ensure all pure-function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement render functions
  - [x] 6.1 Implement `renderBalance()`
    - Reads `computeBalance(AppState.transactions)`; formats with `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`; writes to `#balance-display`
    - _Requirements: 3.1, 3.4_

  - [x] 6.2 Implement `renderTransactionList()`
    - Sorts `AppState.transactions` descending by `date`; slices to first `MAX_RENDERED_TRANSACTIONS` for rendering; `computeBalance` still uses full array
    - For each transaction builds `<li data-id="…">` showing name, amount (currency), category, date; appends `<button class="delete-btn">Delete</button>`
    - Applies CSS class `txn-alert` to `<li>` elements whose category total ≥ `AppState.spendingLimits[category]`
    - Shows `<li class="empty-state">No transactions recorded.</li>` when array is empty
    - _Requirements: 2.1, 2.3, 2.5, 8.3, 10.5_

  - [ ]* 6.3 Write property test for `renderTransactionList` display correctness (Property 5, Property 6, Property 20)
    - **Property 5: Transaction list displays all required fields** — for any non-empty array, each rendered `<li>` contains the item name, amount, category, and date of its transaction
    - **Property 6: Transaction list is sorted descending by date** — rendered items appear in descending date order
    - **Property 20: Render cap preserves balance correctness** — for N > 500 transactions, rendered count ≤ 500 while `computeBalance` returns sum of all N
    - **Validates: Requirements 2.1, 2.3, 10.5**

  - [x] 6.4 Implement `renderChart()`
    - Calls `computeChartData(AppState.transactions, AppState.customCategories, AppState.spendingLimits)`
    - If no data: hides `#spending-chart`, shows `#chart-placeholder`
    - If `AppState.chartInstance` exists: updates `chart.data.labels`, `chart.data.datasets[0].data`, `chart.data.datasets[0].backgroundColor`, then calls `chart.update()`
    - Otherwise: creates a new `Chart` instance (type `'pie'`), stores it in `AppState.chartInstance`
    - _Requirements: 4.1, 4.4, 4.6_

  - [x] 6.5 Implement `renderMonthlySummary()`
    - Called only when `AppState.summaryVisible` is `true`
    - Calls `computeMonthlySummary(AppState.transactions, [...BUILTIN_CATEGORIES, ...AppState.customCategories])`
    - Builds an HTML table: rows are months, columns are categories that have any spend; shows no-data message when result is empty
    - Writes into `#monthly-summary`
    - _Requirements: 7.2, 7.5_

  - [x] 6.6 Implement `renderSpendingLimitsPanel()`
    - Called only when `AppState.limitPanelVisible` is `true`
    - Renders one row per category (built-in + custom): category label, `<input type="number">` pre-filled with current limit if set, Save button, Clear button
    - Wires save/clear buttons to `handleSaveLimit` and `handleClearLimit`
    - Writes into `#limit-settings`
    - _Requirements: 8.1, 8.7_

  - [x] 6.7 Implement master `render()` function
    - Calls `renderBalance()`, `renderTransactionList()`, `renderChart()`
    - Conditionally calls `renderMonthlySummary()` when `AppState.summaryVisible`; sets `#monthly-summary` `hidden` attribute otherwise
    - Conditionally calls `renderSpendingLimitsPanel()` when `AppState.limitPanelVisible`; sets `#limit-settings` `hidden` attribute otherwise
    - Populates `#category` `<select>` options from `[...BUILTIN_CATEGORIES, ...AppState.customCategories]`
    - _Requirements: 1.2, 7.3, 7.4_

- [x] 7. Implement event handlers and notification system
  - [x] 7.1 Implement `showNotification(message)` and `dismissNotification()`
    - `showNotification`: sets `#notification-msg` text, removes `hidden` from `#notification-bar`
    - `dismissNotification`: adds `hidden` to `#notification-bar`
    - Wire `#notification-dismiss` click to `dismissNotification`
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 7.2 Implement `handleFormSubmit(event)`
    - `event.preventDefault()`
    - Reads `#item-name`, `#amount`, `#category` values
    - Calls `Validator.validateTransaction(name, amount, category, [...BUILTIN_CATEGORIES, ...AppState.customCategories])`
    - On invalid: displays inline errors in each field's `<span class="error">`; returns without saving
    - On valid: builds transaction object `{ id: crypto.randomUUID(), name, amount: parseFloat(amount), category, date: new Date().toISOString() }`
    - Calls `StorageService.saveTransaction(txn)`; on `localStorage` error: catches and calls `showNotification`; returns without mutating `AppState`
    - On success: pushes to `AppState.transactions`, clears inline errors, resets form (`name=''`, `amount=''`, `category='Food'`), calls `render()`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 5.1_

  - [x] 7.3 Implement `handleDeleteClick(id)`
    - Calls `StorageService.removeTransaction(id)`; on error: catches and calls `showNotification` (list unchanged)
    - On success: splices transaction from `AppState.transactions`, calls `render()`
    - _Requirements: 2.4, 2.6, 5.3_

  - [x] 7.4 Implement `handleAddCategory()`
    - Reads `#custom-cat-input` value
    - Calls `Validator.validateCategory(name, [...BUILTIN_CATEGORIES, ...AppState.customCategories])`
    - On invalid: sets `#custom-cat-error` text; returns
    - On valid: builds updated array, calls `StorageService.saveCustomCategories(updated)`; on error: calls `showNotification`; returns
    - On success: pushes to `AppState.customCategories`, clears `#custom-cat-error`, clears input, calls `render()`
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 7.5 Write property test for `handleAddCategory` / `validateCategory` pipeline (Property 11)
    - **Property 11: Valid custom category is added and persisted** — for any string of 1–50 characters that is not a duplicate and count < 50, the category is added to `AppState.customCategories` and written to `localStorage`
    - **Validates: Requirements 6.2**

  - [x] 7.6 Implement `handleSaveLimit(category, value)` and `handleClearLimit(category)`
    - `handleSaveLimit`: calls `Validator.validateSpendingLimit(value)`; on invalid: shows inline error in limits panel; on valid: updates `AppState.spendingLimits[category]`, calls `StorageService.saveSpendingLimits`, calls `render()`
    - `handleClearLimit`: deletes `AppState.spendingLimits[category]`, calls `StorageService.saveSpendingLimits`, calls `render()`
    - _Requirements: 8.2, 8.6, 8.7_

  - [ ]* 7.7 Write property tests for spending limit alert state (Properties 17, 18)
    - **Property 17: Valid spending limit is persisted** — for any valid limit value, it is stored in `AppState.spendingLimits` and in `localStorage` under the correct category key
    - **Property 18: Spending limit alert state is correct** — for any combination of transaction amounts and a spending limit, the alert flag is `true` iff category total ≥ limit; this drives both `txn-alert` class and chart segment color
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

  - [x] 7.8 Wire toggle buttons and DOMContentLoaded init
    - `#toggle-summary-btn` click: toggles `AppState.summaryVisible`, calls `render()`
    - `#toggle-limits-btn` click: toggles `AppState.limitPanelVisible`, calls `render()`
    - `DOMContentLoaded`: calls `StorageService.loadAll()`; populates `AppState`; shows per-key notifications for any load errors; calls `render()`
    - Wire `#txn-form` submit → `handleFormSubmit`
    - Wire `#add-cat-btn` click → `handleAddCategory`
    - Wire `#txn-list` click with event delegation → `handleDeleteClick` when `event.target` matches `.delete-btn`
    - _Requirements: 5.2, 6.7, 6.8, 7.3_

- [x] 8. Implement CSS layout, theming, and accessibility
  - [x] 8.1 Write responsive base layout in `css/style.css`
    - Use CSS custom properties: `--color-alert`, `--color-bg`, `--color-text`, `--color-label`
    - Sticky/fixed `<header>` with balance and toggle buttons
    - Two-column layout on wide viewports (≥ 640px): form + list on one side, chart on the other; single column on narrow viewports
    - `#txn-list-wrapper`: `overflow-y: auto; max-height: …` to make list scrollable
    - _Requirements: 2.2, 10.4_

  - [x] 8.2 Add typography and contrast styles
    - Label text ≥ 2px larger than supporting text; color contrast ratio ≥ 4.5:1 for all text/background pairs
    - Define `.txn-alert` class: distinct background color using `var(--color-alert)` at reduced opacity or a derived tint, visually different from default row background
    - _Requirements: 8.3, 10.3_

  - [x] 8.3 Add responsive breakpoints for 320px–1920px
    - At 320px: all content fits in a single column; no horizontal scroll; inputs and buttons are touch-friendly (min 44px height)
    - At 1920px: layout is centered with a max-width container; chart and list are side-by-side
    - _Requirements: 10.4_

- [x] 9. Implement `loadAll` error handling and notification paths
  - [x] 9.1 Handle `localStorage` unavailable / corrupt on load
    - In `StorageService.loadAll()`, track per-key errors; return error flags alongside data
    - In the `DOMContentLoaded` handler, check error flags and call `showNotification` with the appropriate message per requirement 5.5 and 5.6
    - Initialize `AppState.transactions = []` when transaction data failed to load
    - Initialize `AppState.customCategories = []` when category data failed to load; call `showNotification` per requirement 6.8
    - _Requirements: 5.5, 5.6, 6.8_

  - [x] 9.2 Handle Chart.js CDN failure
    - Wrap Chart.js `new Chart(...)` call in try/catch; on failure: hide `#spending-chart`, show a static fallback message in `#chart-placeholder`; log error to console
    - _Requirements: 4.4, 4.6_

- [x] 10. Write `StorageService` property tests for category selector (Property 1) and custom-category reload round-trip (Property 14)
  - [x]* 10.1 Write property test for category selector completeness (Property 1)
    - **Property 1: Category selector completeness** — for any array of valid custom category names, the combined `[...BUILTIN_CATEGORIES, ...customCategories]` array contains exactly the three built-ins plus every custom name, with no duplicates
    - **Validates: Requirements 1.2**

  - [x]* 10.2 Write property test for custom-category reload round-trip (Property 14)
    - **Property 14: Custom categories survive a reload round-trip** — for any set of valid custom categories written via `saveCustomCategories`, calling `loadAll` returns them all
    - **Validates: Requirements 6.7**

- [x] 11. Final checkpoint — Ensure all tests pass and full feature is wired together
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** (`fc.assert(fc.property(…), { numRuns: 100 })`); mock `localStorage` with an in-memory object
- Each property test carries the comment `// Feature: expense-budget-visualizer, Property N: <title>`
- `StorageService` methods **throw** on `localStorage` errors; callers are responsible for catching and routing to `showNotification`
- `render()` is idempotent — calling it twice produces the same DOM
- Balance is always computed from the full `AppState.transactions` array, even when the list renders only 500 items
- Chart.js instance is reused (`chart.update()`) rather than destroyed/recreated on each render pass
- `crypto.randomUUID()` is used for transaction IDs with `Date.now().toString()` as fallback for older browsers
- The `manifest.json` enables unpacked browser extension deployment (Requirement 9.2) but is not required for standalone HTML use

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.3", "3.5"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.4", "3.6", "4.1", "4.3", "4.7"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.5", "4.8"] },
    { "id": 5, "tasks": ["4.6", "6.1", "6.2", "6.4", "6.5", "6.6"] },
    { "id": 6, "tasks": ["6.3", "6.7"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.6"] },
    { "id": 8, "tasks": ["7.5", "7.7", "7.8", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "9.1", "9.2", "10.1", "10.2"] }
  ]
}
```
