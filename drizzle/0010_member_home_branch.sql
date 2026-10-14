-- Do not infer a member's home branch from payments or access history.
ALTER TABLE members ADD COLUMN home_branch text
  CHECK (home_branch IS NULL OR home_branch IN ('calle30','calle23','velez','pilates'));
CREATE INDEX members_owner_home_branch ON members(owner,home_branch);
