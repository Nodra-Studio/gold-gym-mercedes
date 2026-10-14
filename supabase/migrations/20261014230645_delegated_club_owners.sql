-- Additional owners are explicit staff memberships in the original club.
-- Their owner column remains the canonical dataset ID; RLS is unchanged.
-- This only enables the role. It creates no accounts or memberships.
ALTER TABLE club.staff DROP CONSTRAINT staff_check;
ALTER TABLE club.staff ADD CONSTRAINT staff_access_check
  CHECK (
    role IN ('owner', 'reception', 'gate', 'player')
    AND status IN ('active', 'revoked')
  );
