-- Membership belongs to an explicitly recorded branch, independently of where
-- the member pays or trains. Preserve historical records as unassigned.
ALTER TABLE club.members
  ADD COLUMN home_branch text
    CHECK (home_branch IS NULL OR home_branch IN ('calle30','calle23','velez','pilates'));
CREATE INDEX members_owner_home_branch ON club.members(owner,home_branch);
