# Farm Management Platform Architecture

## Product Shape

The platform has three clients backed by one API and one PostgreSQL database:

- Mobile app: React Native for fast field operations and APK distribution.
- Admin web: Next.js for configuration, reporting, approvals, and finance.
- Backend API: Django + Django REST Framework for business rules and authorization.

The clients never write directly to PostgreSQL. Financial mutations go through server-side application services and database transactions.

## Core Boundaries

### Identity and tenancy

Every business record belongs to a `Farm`. Users receive roles and permissions within a farm. UUIDs are used for public entity identifiers. Server-side authorization checks both permission and farm ownership.

### Structured financial core

Accounting data remains relational and strongly typed even when user-facing forms are dynamic:

- `Account`, `Journal`, `JournalEntry`, and `LedgerLine` implement double-entry accounting.
- Monetary values use `NUMERIC`, never floating point.
- Each monetary amount has a currency.
- Completed financial actions are reversed or voided, never hard-deleted.
- Compound operations use one database transaction and roll back together.

### Configurable business data

Lists and form presentation are database-driven:

- `CustomFieldDefinition` describes a field and its validation rules.
- `CustomFieldValue` stores values for supported entities.
- Categories, statuses, animal types, breeds, units, and payment methods are scoped records with `is_active` and ordering.

Dynamic fields extend forms; they do not replace structured columns required for accounting, relationships, reporting, or integrity.

### Production branches

The farm is run as two businesses under one roof: breeding (ewes kept for milk
and lambs) and fattening (animals bought, fed, and sold). Each has to be read
on its own, so `branch` is a dimension on `LedgerLine`, not on `JournalEntry`.
One invoice can therefore split across both, and the branch columns always add
back up to the farm total.

A branch is a `CatalogItem`, not an enum: a farm can rename them or add a third
from the settings screen. A third row, "shared", carries the costs that belong
to neither alone - electricity, wages, administration.

Physical facts follow the same dimension. An `Animal` belongs to a branch and
moving it between them is an event on its timeline. A feed store belongs to a
branch, so issuing from it needs no extra question about who is being charged.

Numbering follows the branch too. Each branch counts its animals from one and
carries the letters its numbers start with in `metadata.tag_prefix` - `TR` for
breeding, `TS` for fattening - so a farm that adds a third branch names its own
prefix from the settings screen. Counting runs over the prefix rather than the
branch, so an animal moved across keeps its number and that number is never
handed out again.

Revenue is chosen from the animal, not from a field someone has to remember to
fill: an animal sold under the culling reason credits Culled sales, one born on
the farm credits Offspring sales, and anything else credits Animal sales. Under
breeding those read as the two income lines the owner asked for; under
fattening the same rule leaves purchased-and-sold stock on Animal sales.

### Feed stores

`InventoryStore` holds `InventoryItem` rows, and its quantity and value are
derived from `StockMovement` rows - never stored as running totals, for the
same reason ledger balances are not.

Feed is an asset while it sits in the store and becomes an expense the day it
is eaten:

- Receiving debits the store's own asset account under Inventory.
- Issuing credits that account and debits Feed consumed, carrying the store's
  branch.
- Transfers move value between the two stores without creating an expense.
- Stock counts and write-offs book the difference against Stock loss.

Costing is the weighted moving average. Every receipt re-averages the store;
every issue leaves at the average of that moment and keeps that cost forever,
even if a cheaper load arrives the next day.

### Milk

`MilkProduction` logs litres per milking whether or not anything is sold, and
`MilkSale` records what was sold and posts the money. They are separate on
purpose: the gap between them is what the farm drank, turned into cheese, or
lost, and merging the two would hide it.

### Founding costs

`FoundingCost` is the register of what the farm was built with - barn, fence,
tank, generator. Each row debits Fixed assets, not an expense account, so the
month the barn was built does not read as a losing month. The register only
accumulates; anything built later is another row. No depreciation is applied.

### Theme and branding

A farm owns a published `ThemeConfig` and an optional draft version. It contains brand name, logo references, color tokens, font choice, density, corner style, and navigation preferences.

The web client renders CSS variables from the validated theme. React Native maps the same token contract to its native theme. The API validates color contrast and allowed font values before publishing. A theme change is configuration data and does not require a new APK.

## Initial Modules

1. Authentication, farms, users, roles, and permissions.
2. Animals, types, breeds, parent relationships, births, and timelines.
3. Accounts, opening balances, ledger, expenses, income, transfers, and approvals.
4. Partners, worker liabilities, settlements, suppliers, and customers.
5. Feed stores, milk production, and founding costs.
6. Reports, exports, notifications, and backup operations.
7. Dynamic fields, settings, and theme builder.

## First Vertical Slice

The first executable slice should prove the system's most important contract:

1. Sign in to one farm.
2. Create an animal with a configurable field.
3. Create an expense paid by farm cash.
4. Verify balanced ledger lines and updated account balance.
5. Record an audit event.
6. Load the published farm theme in the mobile and web clients.

## Offline Direction

Field actions use a local outbox with client-generated idempotency keys. The API stores processed keys for financial commands. Synchronization retries are safe, and conflicts are resolved on the server with explicit user-visible states rather than silently merging ledger entries.

---

## Implementation Notes (built)

### Posting engine contract

`apps/ledger/services.post_entry(farm, date, kind, lines, ...)` is the only
writer of `LedgerLine`. It validates, inside one transaction, that:

- every account belongs to the requesting farm and is active,
- every account's currency matches the entry currency,
- each line is either a debit or a credit, never both, never negative, never zero,
- total debits equal total credits, and the total is greater than zero.

If any check fails the whole command raises before a row is written. On success
the entry is `posted`, unless an `ApprovalRule` for that kind and amount puts it
in `pending`, in which case it does not affect any balance until approved.

`idempotency_key` makes a retried command return the original entry rather than
posting twice. This is what makes the planned offline outbox safe.

### Chart of accounts

Seeded per farm, then owned by the farm. Application code refers to accounts by
code, never by name, so an owner can rename anything.

| Code | Account | Purpose |
| --- | --- | --- |
| 1010 / 1020 | Farm cash box / Bank | Real money |
| 1050 | Cash held by staff | Advances a person holds for the farm |
| 1100-xxx | Receivable per customer | What people owe the farm |
| 1200 | Livestock | Carrying value of animals |
| 1300 / 1400 | Inventory / Fixed assets | Stock and equipment |
| 2100-xxx | Payable per supplier | What the farm owes suppliers |
| 2200-xxx | Payable per worker | Money a worker spent from their own pocket |
| 3100-xxx / 3200-xxx | Partner capital / drawings | Kept separate from ownership % |
| 3900 | Opening balance equity | Whatever existed before the system |
| 4000-xxx / 4100 | Revenue categories / animal sales | |
| 5000-xxx / 5100 / 5200 | Expense categories / cost of animals sold / death loss | |

Expense and revenue categories are catalog rows, and each gets its own account
on first use, so the settings screen and the ledger never drift apart.

### Worked example: the supervisor pays from his own pocket

```
Feed expense 500     Dr 5000-001 Feed        500
                     Cr 2200-001 Due to Khaled   500

Partial repayment    Dr 2200-001 Due to Khaled   300
                     Cr 1010 Farm cash box       300

Remaining owed to Khaled: 200, derived from the account, not stored.
```

### Permissions

`Permission` rows are `<module>.<action>` (e.g. `finance.approve`). `Role` is a
farm-scoped row holding a set of them; `Membership` links a user to a farm with
a role, plus per-user grants and revocations. The API enforces them through a
`required_permissions` map on each view, so a new endpoint cannot silently ship
without an access rule.

### Test coverage of the invariants

`backend/tests` locks the rules that must survive every future change:
unbalanced entries rejected, posted entries undeletable, reversal instead of
delete, idempotent retries, per-farm isolation, permission enforcement, custom
field validation on the server, and theme contrast validation before publish.
