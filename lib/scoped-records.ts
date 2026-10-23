import type { Principal } from "@/lib/server";
import {
  allowsActivity,
  allowsOperation,
  type Activity,
} from "@/lib/staff-scope";

export function isRestricted(p: Principal) {
  return (
    p.role !== "owner" &&
    (p.activity_scope !== "all" || p.branch_scope !== "all")
  );
}
export function venueBranch(venue: string) {
  return (
    (
      {
        "Calle 30": "calle30",
        "Calle 23": "calle23",
        "Club Unión": "velez",
        "Unión Gold Club": "velez",
        "Club Vélez": "velez",
        Pilates: "pilates",
      } as Record<string, string>
    )[venue] ?? ""
  );
}
export function venueActivity(venue: string): Activity {
  return venue === "Pilates" ? "pilates" : "gym";
}
export function planScopeSQL(p: Principal, alias = "p") {
  if (!isRestricted(p)) return "1=1";
  const scopes = [
    allowsActivity(p, "gym") && "'gym'",
    allowsActivity(p, "pilates") && "'pilates'",
  ].filter(Boolean);
  return scopes.length
    ? `${alias}.access_scope IN (${[...scopes, "'all'"].join(",")})`
    : "1=0";
}
export function memberScopeSQL(p: Principal, alias = "m") {
  if (!isRestricted(p)) return "1=1";
  const permitted = (plan: string) => {
    const clauses: string[] = [];
    if (allowsActivity(p, "gym"))
      clauses.push(
        `${plan}.access_scope IN ('gym','all')`,
      );
    if (allowsActivity(p, "pilates"))
      clauses.push(`${plan}.access_scope IN ('pilates','all')`);
    return clauses.length ? clauses.join(" OR ") : "1=0";
  };
  return `(EXISTS(SELECT 1 FROM plans scoped_plan WHERE scoped_plan.id=${alias}.plan_id AND scoped_plan.owner=${alias}.owner AND (${permitted("scoped_plan")})) OR EXISTS(SELECT 1 FROM member_memberships scoped_mm JOIN plans scoped_plan ON scoped_plan.id=scoped_mm.plan_id AND scoped_plan.owner=scoped_mm.owner WHERE scoped_mm.member_id=${alias}.id AND scoped_mm.owner=${alias}.owner AND (${permitted("scoped_plan")})))`;
}
export function venueScopeSQL(p: Principal, column: string) {
  if (!isRestricted(p)) return "1=1";
  const venues = [
    ["Calle 30", "calle30"],
    ["Calle 23", "calle23"],
    ["Club Unión", "velez"],
    ["Unión Gold Club", "velez"],
    ["Club Vélez", "velez"],
    ["Pilates", "pilates"],
  ]
    .filter(([name, branch]) => allowsOperation(p, venueActivity(name), branch))
    .map(([name]) => `'${name}'`);
  return venues.length ? `${column} IN (${venues.join(",")})` : "1=0";
}
export function paymentScopeSQL(p: Principal, alias = "p") {
  if (!isRestricted(p)) return "1=1";
  const predicates=["gym","pilates"].flatMap(activity=>{
    const venues=["calle30","calle23","velez","pilates"].filter(branch=>allowsOperation(p,activity as Activity,branch));
    return venues.length?[`(${alias}.activity='${activity}' AND ${alias}.venue IN (${venues.map(v=>`'${v}'`).join(",")}))`]:[];
  });
  return predicates.length?`(${predicates.join(" OR ")})`:"1=0";
}

// Global profile status and the primary plan affect every activity of a member.
// A scoped desk can operate its memberships without rewriting shared eligibility.
export function memberEditSQL(p: Principal, alias = "m") {
  if (!isRestricted(p) || p.activity_scope === "all") return "1=1";
  return `(EXISTS(SELECT 1 FROM plans primary_plan WHERE primary_plan.id=${alias}.plan_id AND primary_plan.owner=${alias}.owner AND primary_plan.access_scope='${p.activity_scope}') AND NOT EXISTS(SELECT 1 FROM member_memberships edit_mm JOIN plans extra_plan ON extra_plan.id=edit_mm.plan_id AND extra_plan.owner=edit_mm.owner WHERE edit_mm.member_id=${alias}.id AND edit_mm.owner=${alias}.owner AND extra_plan.access_scope<>'${p.activity_scope}'))`;
}
