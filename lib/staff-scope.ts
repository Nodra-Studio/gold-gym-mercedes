export const staffActivities = ["all", "gym", "padel", "pilates"] as const;
export const staffBranches = ["all", "calle30", "calle23", "velez"] as const;
export type Activity = "gym" | "padel" | "pilates";
export type StaffScope = {
  activity_scope: (typeof staffActivities)[number];
  branch_scope: (typeof staffBranches)[number];
};
type ScopedRole = {
  role: string;
  activity_scope?: string;
  branch_scope?: string;
};
export const unrestrictedScope: StaffScope = {
  activity_scope: "all",
  branch_scope: "all",
};
export function validStaffScope(
  value: ScopedRole,
): value is ScopedRole & StaffScope {
  return (
    staffActivities.includes(
      value.activity_scope as StaffScope["activity_scope"],
    ) &&
    staffBranches.includes(value.branch_scope as StaffScope["branch_scope"]) &&
    (["all", "gym"].includes(value.activity_scope ?? "") ||
      value.branch_scope === "all")
  );
}
export function allowsActivity(value: ScopedRole, activity: Activity) {
  if (value.role === "owner") return true;
  return (
    validStaffScope(value) &&
    (value.activity_scope === "all" || value.activity_scope === activity)
  );
}
export function allowsOperation(
  value: ScopedRole,
  activity: Activity,
  branch: string | null | undefined,
) {
  if (!allowsActivity(value, activity)) return false;
  if (activity === "padel") return branch === "velez";
  if (activity === "pilates") return branch === "pilates";
  return (
    ["calle30", "calle23", "velez"].includes(branch ?? "") &&
    (value.role === "owner" ||
      value.branch_scope === "all" ||
      value.branch_scope === branch)
  );
}
// A branch alone can identify two activities at Club Unión. Routes that know
// the activity must use allowsOperation to avoid granting gym access via pádel.
export function allowsBranch(
  value: ScopedRole,
  branch: string | null | undefined,
) {
  if (value.role === "owner") return true;
  return (
    allowsOperation(value, "gym", branch) ||
    allowsOperation(value, "padel", branch) ||
    allowsOperation(value, "pilates", branch)
  );
}
export function scopeLabel(
  value: Pick<ScopedRole, "activity_scope" | "branch_scope">,
) {
  if (!validStaffScope({ role: "reception", ...value }))
    return "Alcance inválido · requiere revisión";
  const activity = {
    all: "Todas las actividades",
    gym: "Gimnasio",
    padel: "Pádel · Club Unión",
    pilates: "Pilates",
  }[value.activity_scope as StaffScope["activity_scope"]];
  if (value.branch_scope === "all") return activity;
  const branch = {
    calle30: "Calle 30",
    calle23: "Calle 23",
    velez: "Club Unión",
  }[value.branch_scope as Exclude<StaffScope["branch_scope"], "all">];
  return value.activity_scope === "all"
    ? `${activity} · gimnasio sólo en ${branch}`
    : `${activity} · ${branch}`;
}
