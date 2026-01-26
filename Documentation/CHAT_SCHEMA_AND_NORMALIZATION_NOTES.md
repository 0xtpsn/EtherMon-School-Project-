## ArtMart Database – Schema & Normalization Notes

This document summarizes key concepts we discussed in the chat and relates them directly to your ArtMart coursework project.

---

## 1. What Is a Database Schema?

### 1.1 Simple Definition

**Schema** = the **blueprint** or **structure** of your database.

It describes:
- **What tables** exist (e.g. `users`, `artworks`, `auctions`, `bids`)
- **What columns** each table has (e.g. `username`, `email`, `start_price`)
- **What type of data** each column stores (TEXT, INTEGER, REAL, DATETIME)
- **What rules/constraints** apply (PRIMARY KEY, NOT NULL, UNIQUE, FOREIGN KEY, CHECK)

Your schema is defined in `backend/schema.sql`. For example:

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('buyer','seller'))
);
```

This says:
- There is a table called `users`
- Each user has an `id`, `username`, `email`, `password_hash`, and `role`
- `id` is the primary key (unique identifier)
- `username` and `email` must be unique and not empty
- `role` can only be `'buyer'` or `'seller'`

Think of the schema as the **plan**. The actual rows (data) are the **content**.

---

## 2. Why Normalization Matters

### 2.1 Goal of Normalization

**Normalization** is the process of organizing your database so that:
- You **don’t store the same information twice** (no redundancy)
- You **can’t get contradictory data** (no inconsistency)
- You can **update data in one place**, not many places

It does this by splitting data into multiple related tables and enforcing **rules** about how data is stored.

In COMP0178, you are expected to normalize your database up to **Third Normal Form (3NF)**.

---

## 3. The Three Main Normal Forms (1NF, 2NF, 3NF)

### 3.1 First Normal Form (1NF) – Atomic Values

**Rule**:  
Each column must contain **one value only** (no lists, no repeating groups).

Bad example (not 1NF):

```text
user   | phone_numbers
-------+-----------------------------
Alice  | 555-1234, 555-5678, 555-9999
```

Good example (1NF):

```text
user   | phone
-------+---------
Alice  | 555-1234
Alice  | 555-5678
Alice  | 555-9999
```

Your ArtMart schema already satisfies 1NF: every column is a single, atomic value.

---

### 3.2 Second Normal Form (2NF) – No Partial Dependencies

**Rule**:  
Every non-key column must depend on the **whole** primary key, not just part of it.

This only matters when a table has a **composite primary key** (e.g. `(order_id, product_id)`).

In ArtMart, most tables use a single-column primary key (`id`), so 2NF is automatically satisfied.
Junction tables like `favorites` and `watchlist` have their own `id` plus a UNIQUE pair `(user_id, artwork_id)`, which is also OK.

---

### 3.3 Third Normal Form (3NF) – No Transitive Dependencies

**Rule**:  
Every non-key column must depend **directly** on the primary key, **not on another non-key column**.

Another way to say this:
- If a column’s value can be **calculated from other tables**, it should **not be stored** in this table.
- Otherwise, you risk **redundancy** and **inconsistency**.

This was the most important part for your coursework.

---

## 4. 3NF in Your ArtMart Schema (Before vs After)

### 4.1 Problematic Columns (Before)

Initially, your schema had these columns:

- In `auctions`:
  - `current_bid`
  - `highest_bidder_id`
- In `balances`:
  - `total_earned`
  - `total_spent`
- In `artworks`:
  - `favorites_count` (mentioned in earlier versions, later removed)

All of these are **derived** / **computable** from other tables:

- `current_bid` can be computed from the `bids` table
- `highest_bidder_id` can be computed from the `bids` table
- `total_earned` can be computed from the `transactions` table
- `total_spent` can be computed from the `transactions` table
- `favorites_count` can be computed from the `favorites` table

This means they introduce **transitive dependencies**, which violates 3NF.

#### Example: `current_bid`

```sql
-- Bad (denormalized):
SELECT current_bid FROM auctions WHERE id = ?;

-- Good (3NF compliant, computed from bids):
SELECT MAX(amount)
FROM bids
WHERE auction_id = ? AND is_active = 1;
```

If a new bid is inserted but `current_bid` is not updated, you get inconsistent data.  
By **not storing** `current_bid` at all, and always computing it, you avoid this problem completely.

---

### 4.2 How You Fixed It

In your final schema (`backend/schema.sql`):

- You **removed** these derived columns:
  - `auctions.current_bid`
  - `auctions.highest_bidder_id`
  - `balances.total_earned`
  - `balances.total_spent`
- You **compute** their values using SQL queries and views, for example:

```sql
CREATE VIEW IF NOT EXISTS v_auctions_with_bids AS
SELECT 
    au.*,
    (SELECT MAX(b.amount) 
     FROM bids b 
     WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
    (SELECT b.bidder_id 
     FROM bids b 
     WHERE b.auction_id = au.id AND b.is_active = 1 
     ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id,
    (SELECT COUNT(*) 
     FROM bids b 
     WHERE b.auction_id = au.id AND b.is_active = 1) AS bid_count
FROM auctions au;
```

and:

```sql
CREATE VIEW IF NOT EXISTS v_balances_with_totals AS
SELECT 
    b.*,
    COALESCE((
        SELECT SUM(t.amount) 
        FROM transactions t
        WHERE t.user_id = b.user_id 
          AND t.type = 'sale' 
          AND t.status = 'completed'
    ), 0) AS total_earned,
    COALESCE((
        SELECT SUM(t.amount) 
        FROM transactions t
        WHERE t.user_id = b.user_id 
          AND t.type = 'purchase' 
          AND t.status = 'completed'
    ), 0) AS total_spent
FROM balances b;
```

This approach:
- Keeps the **base tables** in strict 3NF
- Still gives you **easy access** to computed values using views
- Impresses examiners because it shows you really understand normalization

---

## 5. Role Constraint Fix (`role IN ('buyer','seller')`)

Originally, your documentation said:

> `role` (TEXT, NOT NULL, CHECK: 'buyer', 'seller', or 'both')  

But your actual schema was:

```sql
role TEXT NOT NULL CHECK(role IN ('buyer','seller'))
```

Why is this important?

- For the **ERD ↔ Schema Consistency** part of the marking:
  - Every constraint described in the ERD should match the actual schema
  - Inconsistency makes it look like the ERD and schema were not kept in sync
- You fixed this by:
  - Updating `ER_DIAGRAM.md` to say `CHECK: 'buyer' or 'seller'`
  - Explaining that the **application logic** allows a seller to act as both buyer and seller

This doesn’t affect normalization itself, but it **improves documentation quality**, which examiners care about.

---

## 6. Categories Table and Normalization

You also added a **`categories`** table:

```sql
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

and pre-populated it with standard categories.

Even though `artworks.category` is still stored as `TEXT` (for flexibility), having a `categories` table:
- Shows you understand how to **normalize repeating values** into their own table
- Allows you to enforce valid categories at the application level if desired
- Gives you an easy place to attach extra data like `description` and `display_order`

This is a **normalization-friendly design** and a plus for your marks.

---

## 7. Normalization and Your Marks

In COMP0178, examiners look for:

- **1NF**: No repeating groups, atomic values ✔️
- **2NF**: All non-key attributes depend on the whole primary key ✔️
- **3NF**: No transitive dependencies, no stored derived values ✔️
- **Clean ERD ↔ Schema mapping** ✔️
- **Good use of foreign keys and constraints** ✔️

Your final schema:
- Removes or avoids all the common 3NF violations (like `current_bid`, `total_earned`, etc.)
- Documents the design clearly in `ER_DIAGRAM.md` and `3NF_COMPLIANCE_REPORT.md`
- Uses views to provide convenient access to computed data while keeping the base tables normalized

This is exactly what examiners want to see for a high score in the **Database Design (20%)** part of the coursework.

---

## 8. Very Short Recap (For Revision)

- **Schema** = structure/blueprint of the database (tables, columns, constraints)
- **Normalization** = organizing that schema to avoid redundancy and inconsistency
- **1NF** = atomic values (no lists in a single cell)
- **2NF** = no partial dependency on part of a composite key
- **3NF** = no stored computed/derived values (no transitive dependencies)
- In ArtMart, you:
  - Removed derived columns (`current_bid`, `highest_bidder_id`, `total_earned`, `total_spent`)
  - Compute them dynamically via SQL queries and views
  - Fixed documentation (role constraint) to match the real schema
  - Added a `categories` table to further show normalization understanding

This document can be cited in your reports as an explanation of how your schema achieves 3NF.


