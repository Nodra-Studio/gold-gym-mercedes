-- Evaluate the club context once per query rather than once per terminal row.
ALTER POLICY club_scope ON club.offline_devices TO gold_gym_app
  USING(owner=(SELECT current_setting('app.club_owner',true)))
  WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
ALTER POLICY club_scope ON club.offline_snapshots TO gold_gym_app
  USING(owner=(SELECT current_setting('app.club_owner',true)))
  WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
ALTER POLICY club_scope ON club.offline_events TO gold_gym_app
  USING(owner=(SELECT current_setting('app.club_owner',true)))
  WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
