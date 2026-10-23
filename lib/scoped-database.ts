import { supportsSitesIdentity } from "@club/runtime";
import { ClubError, type Principal } from "@/lib/server";

/** Revalidate the actor in the same transaction as every private mutation. */
export function authenticatedDatabase(
  db: D1Database,
  p: Principal,
  reason: string | null = null,
  resourceChecks: D1PreparedStatement[] = [],
): D1Database {
  return {
    prepare: db.prepare.bind(db),
    batch: async (statements: D1PreparedStatement[]) => {
      const args = [
        p.owner,
        p.userId,
        p.role,
        p.activity_scope,
        p.branch_scope,
        reason,
      ];
      // The deployed PostgreSQL function also establishes actor/reason context
      // for immutable database audit triggers. SQLite cannot define stored
      // procedures: its checked-overflow guard aborts the entire write batch.
      const assertion = supportsSitesIdentity
        ? db
            .prepare(
              "SELECT abs(CASE WHEN ((?=? AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=?)) OR EXISTS(SELECT 1 FROM staff WHERE owner=? AND user_id=? AND status='active' AND role=? AND (role='owner' OR (activity_scope=? AND branch_scope=?)))) THEN 1 ELSE -9223372036854775808 END) AS allowed",
            )
            .bind(
              p.userId,
              p.owner,
              p.userId,
              p.owner,
              p.userId,
              p.role,
              p.activity_scope,
              p.branch_scope,
            )
        : db
            .prepare("SELECT assert_staff_scope(?,?,?,?,?,?) AS allowed")
            .bind(...args);
      try {
        return (await db.batch([assertion,...resourceChecks, ...statements])).slice(1+resourceChecks.length);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "PT403" || String(error).includes("integer overflow"))
          throw new ClubError(
            "Tu acceso cambió. Volvé a cargar la pantalla antes de continuar.",
            403,
          );
        throw error;
      }
    },
  } as D1Database;
}

/** Repeat a resource-scope predicate while the write lock is held. */
export function resourceScopeAssertion(db: D1Database, p: Principal, existsSql: string, values: (string | number | null)[]) {
  const denied = supportsSitesIdentity ? "abs(-9223372036854775808)" : "assert_staff_scope(?,?,?,?,?,?)";
  return db.prepare(`SELECT CASE WHEN EXISTS(${existsSql}) THEN 1 ELSE ${denied} END AS allowed`)
    .bind(...values, ...(supportsSitesIdentity ? [] : [p.owner,p.userId,"invalid-role","invalid-activity","invalid-branch",null]));
}
