# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application built with HTML, CSS, and Vanilla JavaScript. It allows users to track personal expenses by recording transactions with a name, amount, and category. It displays a running balance, a scrollable transaction list with delete capability, and a live pie chart of spending by category. The app stores all data in the browser's LocalStorage and requires no backend or external setup. Additional features include custom categories, a monthly summary view, and per-category spending limit alerts.

## Glossary

- **App**: The Expense & Budget Visualizer web application.
- **Transaction**: A single expense entry consisting of an Item Name, Amount, and Category.
- **Category**: A label assigned to a Transaction. Built-in categories are Food, Transport, and Fun. Users may also define Custom Categories.
- **Custom_Category**: A user-defined Category beyond the built-in defaults.
- **Balance**: The total of all Transaction amounts, displayed at the top of the App.
- **Transaction_List**: The scrollable UI component that displays all stored Transactions.
- **Chart**: The pie chart rendered by Chart.js that shows spending broken down by Category.
- **LocalStorage**: The browser's Web Storage API used to persist all Transactions and settings client-side.
- **Spending_Limit**: A user-defined numeric threshold for a Category, above which the App highlights that Category.
- **Monthly_Summary**: A view that aggregates Transaction amounts grouped by calendar month and Category.
- **Input_Form**: The form component containing the Item Name field, Amount field, Category selector, and submit button.
- **Validator**: The client-side logic that checks Input_Form fields before a Transaction is saved.

---

## Requirements

### Requirement 1: Transaction Entry

**User Story:** As a user, I want to enter a transaction with a name, amount, and category, so that I can record my expenses.

#### Acceptance Criteria

1. THE Input_Form SHALL contain an Item Name text field (accepting up to 100 characters), an Amount numeric field (accepting values between 0.01 and 999,999,999.99), and a Category selector.
2. THE Category selector SHALL include the built-in options: Food, Transport, and Fun, as well as any Custom Categories the user has added.
3. WHEN the user submits the Input_Form with all fields filled and a valid positive Amount, THE App SHALL save the Transaction to LocalStorage and add it to the Transaction_List within 1 second.
4. WHEN the user submits the Input_Form with one or more empty fields, THE Validator SHALL display an inline error message identifying each empty field and SHALL NOT save the Transaction.
5. IF the user submits the Input_Form with an Amount that is zero, negative, non-numeric, or exceeds 999,999,999.99, THEN THE Validator SHALL display an inline error message stating the Amount must be a positive number no greater than 999,999,999.99 and SHALL NOT save the Transaction.
6. WHEN a Transaction is saved successfully, THE Input_Form SHALL reset the Item Name field to empty, the Amount field to empty, and the Category selector to the first built-in option (Food).

---

### Requirement 2: Transaction List

**User Story:** As a user, I want to see all my recorded transactions in a scrollable list, so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display every stored Transaction showing its Item Name, Amount, Category, and Date.
2. WHILE more Transactions exist than fit in the visible area, THE Transaction_List SHALL be scrollable.
3. THE Transaction_List SHALL display Transactions ordered by Date descending, with the most recently dated Transaction at the top.
4. WHEN the user activates the delete control on a Transaction, THE App SHALL remove that Transaction from LocalStorage and remove it from the Transaction_List.
5. IF the Transaction_List contains no Transactions, THEN THE Transaction_List SHALL display a message indicating no transactions have been recorded.
6. IF LocalStorage is unavailable when the user activates the delete control on a Transaction, THEN THE App SHALL display an error message indicating the deletion failed and leave the Transaction unchanged in the Transaction_List.

---

### Requirement 3: Total Balance

**User Story:** As a user, I want to see my total spending balance at the top of the page, so that I know how much I have spent in total.

#### Acceptance Criteria

1. THE App SHALL display the Balance (defined as the sum of all stored Transaction amounts) at the top of the page at all times, formatted as a currency value with two decimal places.
2. WHEN a Transaction is added, THE App SHALL recalculate and update the Balance to reflect the new total.
3. WHEN a Transaction is deleted, THE App SHALL recalculate and update the Balance to reflect the removal.
4. IF no Transactions exist, THEN THE App SHALL display a Balance of 0.00.
5. WHEN a Transaction is edited, THE App SHALL recalculate and update the Balance to reflect the updated amount.

---

### Requirement 4: Spending Chart

**User Story:** As a user, I want to see a pie chart of my spending by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Chart SHALL render as a pie chart using Chart.js, displaying each Category as a segment proportional to its total spend, where total spend for a Category is the sum of all Transaction amounts in that Category.
2. WHEN a Transaction is added, THE App SHALL recalculate all segment proportions from the full current Transaction list and update the Chart.
3. WHEN a Transaction is deleted, THE App SHALL recalculate all segment proportions from the full current Transaction list and update the Chart.
4. IF no Transactions exist, THEN THE Chart SHALL display no segments and SHALL show a placeholder message indicating there is no data.
5. THE Chart SHALL assign a unique color to each Category such that no two Category segments share the same color.
6. IF the App is loaded with no Transactions in LocalStorage, THEN THE Chart SHALL display no segments and SHALL show a placeholder message indicating there is no data.

---

### Requirement 5: Data Persistence

**User Story:** As a user, I want my transactions to be saved between browser sessions, so that I do not lose my data when I close the tab.

#### Acceptance Criteria

1. WHEN a Transaction is saved, THE App SHALL write the Transaction to LocalStorage before updating the UI.
2. WHEN the App is loaded, THE App SHALL read all Transactions from LocalStorage and render the Transaction_List, Balance, and Chart with the persisted data before any user interaction is possible.
3. WHEN a Transaction is deleted, THE App SHALL remove the Transaction from LocalStorage before updating the UI.
4. IF LocalStorage is unavailable or throws an error on write, THEN THE App SHALL display a visible notification in the UI indicating that data cannot be saved, and the notification SHALL remain visible until dismissed by the user.
5. IF LocalStorage throws an error on read during App load, THEN THE App SHALL display a visible notification in the UI indicating that saved data could not be loaded, and SHALL initialize the Transaction_List as empty.
6. IF LocalStorage contains data that cannot be parsed as a valid Transaction_List during App load, THEN THE App SHALL discard the malformed data, initialize the Transaction_List as empty, and display a visible notification in the UI indicating that previously saved data was unreadable.

---

### Requirement 6: Custom Categories

**User Story:** As a user, I want to add my own expense categories, so that I can track spending that does not fit the default options.

#### Acceptance Criteria

1. THE App SHALL provide a UI control that allows the user to enter a Custom_Category name of 1 to 50 characters and submit it.
2. WHEN the user submits a non-empty Custom_Category name of 50 characters or fewer that is not a duplicate of an existing Category, THE App SHALL add the Custom_Category to the Category selector and persist it to LocalStorage.
3. WHEN the user submits a Custom_Category name exceeding 50 characters, THE Validator SHALL display an inline error indicating the name is too long and SHALL NOT add the Category.
4. WHEN the user submits an empty Custom_Category name, THE Validator SHALL display an inline error and SHALL NOT add the Category.
5. WHEN the user submits a Custom_Category name that duplicates an existing Category (case-insensitive), THE Validator SHALL display an inline error indicating the Category already exists and SHALL NOT add it.
6. IF the total number of Custom Categories already saved equals 50, THEN THE App SHALL display an inline error indicating the limit has been reached and SHALL NOT add the new Category.
7. WHEN the App is loaded, THE App SHALL restore all previously saved Custom Categories from LocalStorage.
8. IF LocalStorage data for Custom Categories is unavailable or cannot be parsed on load, THEN THE App SHALL initialize with no Custom Categories and display an error message indicating saved categories could not be restored.

---

### Requirement 7: Monthly Summary View

**User Story:** As a user, I want to view a summary of my spending grouped by month, so that I can track my financial habits over time.

#### Acceptance Criteria

1. THE App SHALL provide a Monthly_Summary view that groups Transactions by calendar month (format: YYYY-MM).
2. WHEN the user opens the Monthly_Summary view, THE App SHALL display the total spend per Category for each calendar month that contains at least one Transaction, ordered from most recent month to oldest.
3. WHILE the Monthly_Summary view is visible, WHEN a Transaction is added or deleted, THE App SHALL update the Monthly_Summary view to reflect the change.
4. WHEN a Transaction's date or amount is edited and the Monthly_Summary view is visible, THE App SHALL update the Monthly_Summary view to reflect the change.
5. IF no Transactions exist, THEN THE Monthly_Summary view SHALL display a message indicating there is no data to show.

---

### Requirement 8: Spending Limit Alerts

**User Story:** As a user, I want to set a spending limit per category and be alerted when I exceed it, so that I can manage my budget proactively.

#### Acceptance Criteria

1. WHEN the user opens the spending limit settings for a Category, THE App SHALL provide an input field that accepts a numeric Spending_Limit value between 0.01 and 999,999,999.99 for that Category.
2. WHEN the user saves a Spending_Limit, THE App SHALL persist it to LocalStorage.
3. WHEN the total spend for a Category meets or exceeds the Spending_Limit for that Category, THE App SHALL apply a distinct background color to that Category's rows in the Transaction_List that differs from the default row background color.
4. WHEN the total spend for a Category meets or exceeds the Spending_Limit for that Category, THE App SHALL apply a distinct color fill to that Category's segment in the Chart that differs from its default segment color.
5. WHEN a Transaction is deleted and the remaining total for a Category falls below the Spending_Limit, THE App SHALL remove the highlight from that Category in the Transaction_List and in the Chart, restoring the default colors.
6. IF the user saves a Spending_Limit input that is empty, non-numeric, zero, or negative, THEN THE Validator SHALL display an inline error message indicating the value must be a positive number and SHALL NOT save the Spending_Limit.
7. WHEN the user clears a saved Spending_Limit for a Category and saves the change, THE App SHALL remove the Spending_Limit from LocalStorage and remove any active highlight for that Category.

---

### Requirement 9: Platform Compatibility

**User Story:** As a user, I want the app to work in any modern browser and be usable as a standalone page or browser extension, so that I can access it wherever I prefer.

#### Acceptance Criteria

1. THE App SHALL function correctly in the current stable release and the two preceding major versions of Chrome, Firefox, Edge, and Safari, where "function correctly" means all UI elements render without visual errors and all features execute without thrown JavaScript exceptions.
2. THE App SHALL be deliverable as a single directory containing an `index.html` entry point and, where required for browser-extension deployment, a `manifest.json` file, such that the directory can be loaded as both a standalone HTML file from the filesystem and as an unpacked browser extension.
3. THE App SHALL use only one CSS file located in the `css/` directory and only one JavaScript file located in the `js/` directory.

---

### Requirement 10: Performance and Usability

**User Story:** As a user, I want the app to load quickly and respond without lag, so that recording expenses feels effortless.

#### Acceptance Criteria

1. THE App SHALL render the initial UI, populate the Transaction_List, update the Balance, and render the Chart within 1 second of page load on a modern desktop browser with up to 500 stored Transactions.
2. WHEN the user adds or deletes a Transaction, THE App SHALL update the Balance, Transaction_List, and Chart within 200ms.
3. THE App SHALL render all text elements such that label text is visually distinguishable from value text and supporting text by a font size difference of at least 2px and a contrast ratio of at least 4.5:1 between text and its background.
4. THE App SHALL be usable on viewport widths from 320px to 1920px without horizontal scrolling or content overlap.
5. IF the Transaction_List contains more than 500 Transactions, THEN THE App SHALL render only the most recent 500 Transactions in the list while still computing the Balance across all stored Transactions.
