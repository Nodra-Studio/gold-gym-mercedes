import type postgres from "postgres";
import type { Query } from "./adapter";

/** D1 bindings are already serialized scalar values. Preserve string bytes when
 * PostgreSQL infers a JSON/JSONB target, instead of JSON-encoding them again. */
export function postgresConnectionQuery(
  connection: Pick<postgres.Sql, "unsafe" | "typed">,
): Query {
  return async (sql, values) => {
    const parameters = values.map((value) =>
      typeof value === "string" ? connection.typed(value, 25) : value,
    );
    const rows = await connection.unsafe(sql, parameters as never[]);
    return { rows: [...rows], count: rows.count };
  };
}
