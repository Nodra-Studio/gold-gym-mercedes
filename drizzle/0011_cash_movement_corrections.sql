-- Legacy SQLite backup parity; operational cash writes use PostgreSQL.
-- Temporarily defer references while replacing the checked ledger table.
PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=ON;
CREATE TABLE cash_entries_new (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 kind text NOT NULL CHECK(kind IN ('sale','expense','income','reversal')), category text NOT NULL, concept text NOT NULL,
 amount integer NOT NULL CHECK(amount<>0 AND abs(amount)<=10000000),
 method text NOT NULL CHECK(method IN ('Efectivo','Transferencia','Tarjeta')),
 day text NOT NULL, created_at text NOT NULL, actor text NOT NULL,
 product_id text, quantity integer CHECK(quantity>0), reverses text,
 request_key text NOT NULL, payload text NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 UNIQUE(owner,id), UNIQUE(owner,request_key), UNIQUE(owner,reverses),
 FOREIGN KEY(owner,product_id) REFERENCES products(owner,id),
 FOREIGN KEY(owner,reverses) REFERENCES cash_entries_new(owner,id),
 CHECK((kind='sale' AND amount>0 AND product_id IS NOT NULL AND quantity IS NOT NULL AND reverses IS NULL)
 OR (kind='expense' AND amount<0 AND product_id IS NULL AND quantity IS NULL AND reverses IS NULL)
 OR (kind='income' AND amount>0 AND product_id IS NULL AND quantity IS NULL AND reverses IS NULL)
 OR (kind='reversal' AND reverses IS NOT NULL))
);
INSERT INTO cash_entries_new(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,reverses,request_key,payload) SELECT id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,reverses,request_key,payload FROM cash_entries;
DROP TABLE cash_entries;
ALTER TABLE cash_entries_new RENAME TO cash_entries;
CREATE INDEX cash_entries_owner_day ON cash_entries(owner,day,venue);
CREATE INDEX cash_entries_product ON cash_entries(owner,product_id);
CREATE TABLE cash_entry_changes (
 id text PRIMARY KEY,owner text NOT NULL,cash_entry_id text NOT NULL,
 before_state text NOT NULL,after_state text NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 300),
 created_at text NOT NULL,actor text NOT NULL,request_key text NOT NULL,payload text NOT NULL,
 UNIQUE(owner,request_key),FOREIGN KEY(owner,cash_entry_id) REFERENCES cash_entries(owner,id)
);
CREATE INDEX cash_entry_changes_owner_entry ON cash_entry_changes(owner,cash_entry_id,created_at);
CREATE INDEX cash_entry_changes_owner_created ON cash_entry_changes(owner,created_at DESC,id DESC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
