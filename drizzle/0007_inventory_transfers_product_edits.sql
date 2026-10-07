ALTER TABLE products ADD COLUMN active integer NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE products ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE stock_moves_new (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 product_id text NOT NULL, quantity integer NOT NULL CHECK(quantity<>0),
 kind text NOT NULL CHECK(kind IN ('receive','sale','reversal','transfer_out','transfer_in','adjustment')), note text NOT NULL,
 actor text NOT NULL, created_at text NOT NULL, cash_entry_id text,
 request_key text NOT NULL, payload text NOT NULL, transfer_id text, UNIQUE(owner,request_key),
 FOREIGN KEY(owner,product_id) REFERENCES products(owner,id),
 FOREIGN KEY(owner,cash_entry_id) REFERENCES cash_entries(owner,id)
);
INSERT INTO stock_moves_new (id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload) SELECT id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload FROM stock_moves;
DROP TABLE stock_moves;
ALTER TABLE stock_moves_new RENAME TO stock_moves;
CREATE INDEX stock_moves_owner_product ON stock_moves(owner,product_id,venue);
CREATE INDEX stock_moves_cash_entry ON stock_moves(owner,cash_entry_id);
CREATE UNIQUE INDEX stock_moves_transfer_kind ON stock_moves(owner,transfer_id,kind);
CREATE TABLE product_changes(id text PRIMARY KEY,owner text NOT NULL,product_id text NOT NULL,before_state text NOT NULL,after_state text NOT NULL,created_at text NOT NULL,actor text NOT NULL,request_key text NOT NULL,payload text NOT NULL,UNIQUE(owner,request_key),FOREIGN KEY(owner,product_id) REFERENCES products(owner,id));
CREATE INDEX product_changes_owner_product ON product_changes(owner,product_id,created_at);
UPDATE accesses SET venue='Club Unión' WHERE venue IN ('Club Vélez','Unión Gold Club');
UPDATE sessions SET venue='Club Unión' WHERE venue IN ('Club Vélez','Unión Gold Club');
