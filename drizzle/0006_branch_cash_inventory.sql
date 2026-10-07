-- Table parity for legacy SQLite backups; operational cash API uses PostgreSQL.
-- Unknown historical collecting branches remain NULL.
ALTER TABLE payments ADD COLUMN venue text CHECK(venue IN ('calle30','calle23','velez','pilates'));
ALTER TABLE booking_payments ADD COLUMN venue text CHECK(venue IN ('calle30','calle23','velez','pilates'));
CREATE TABLE products (
 id text PRIMARY KEY, owner text NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 category text NOT NULL, price integer NOT NULL CHECK(price BETWEEN 1 AND 10000000),
 created_at text NOT NULL, actor text NOT NULL, request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,id), UNIQUE(owner,request_key)
);
CREATE TABLE cash_entries (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 kind text NOT NULL CHECK(kind IN ('sale','expense','reversal')), category text NOT NULL, concept text NOT NULL,
 amount integer NOT NULL CHECK(amount<>0 AND abs(amount)<=10000000),
 method text NOT NULL CHECK(method IN ('Efectivo','Transferencia','Tarjeta')),
 day text NOT NULL, created_at text NOT NULL, actor text NOT NULL,
 product_id text, quantity integer CHECK(quantity>0), reverses text,
 request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,id), UNIQUE(owner,request_key), UNIQUE(owner,reverses),
 FOREIGN KEY(owner,product_id) REFERENCES products(owner,id),
 FOREIGN KEY(owner,reverses) REFERENCES cash_entries(owner,id),
 CHECK((kind='sale' AND amount>0 AND product_id IS NOT NULL AND quantity IS NOT NULL AND reverses IS NULL)
 OR (kind='expense' AND amount<0 AND product_id IS NULL AND quantity IS NULL AND reverses IS NULL)
 OR (kind='reversal' AND reverses IS NOT NULL))
);
CREATE TABLE stock_moves (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 product_id text NOT NULL, quantity integer NOT NULL CHECK(quantity<>0),
 kind text NOT NULL CHECK(kind IN ('receive','sale','reversal')), note text NOT NULL,
 actor text NOT NULL, created_at text NOT NULL, cash_entry_id text,
 request_key text NOT NULL, payload text NOT NULL, UNIQUE(owner,request_key),
 FOREIGN KEY(owner,product_id) REFERENCES products(owner,id),
 FOREIGN KEY(owner,cash_entry_id) REFERENCES cash_entries(owner,id)
);
CREATE INDEX cash_entries_owner_day ON cash_entries(owner,day,venue);
CREATE INDEX stock_moves_owner_product ON stock_moves(owner,product_id,venue);
CREATE INDEX stock_moves_cash_entry ON stock_moves(owner,cash_entry_id);
CREATE INDEX cash_entries_product ON cash_entries(owner,product_id);
