ALTER TABLE staff ADD COLUMN activity_scope text NOT NULL DEFAULT 'all' CHECK(activity_scope IN ('all','gym','padel','pilates'));
ALTER TABLE staff ADD COLUMN branch_scope text NOT NULL DEFAULT 'all' CHECK(branch_scope IN ('all','calle30','calle23','velez'));
ALTER TABLE cash_entries ADD COLUMN activity text NOT NULL DEFAULT 'unclassified' CHECK(activity IN ('gym','padel','pilates','unclassified'));
