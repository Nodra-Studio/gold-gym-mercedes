// Required by the current application. Extra protected tables are allowed.
export const requiredClubTables = Object.freeze([
  'plans', 'members', 'sessions', 'payments', 'accesses', 'audit', 'bookings',
  'enrollments', 'staff', 'imports', 'restores', 'settings', 'booking_payments',
  'auth_limits', 'products', 'cash_entries', 'stock_moves', 'product_changes',
  'booking_requests', 'member_memberships',
]);

export async function verifyClubSchema(query) {
  const tables = await query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='club'");
  const names = new Set(tables.map(table => table.tablename));
  if (requiredClubTables.some(name => !names.has(name)) || tables.some(table => !table.rowsecurity)) {
    throw new Error('schema');
  }
  return tables.length;
}
