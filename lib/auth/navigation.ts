import { safeReturnTo } from './config';

export function portalForRole(role: string) {
  if (role === 'owner' || role === 'reception') return '/gestion';
  if (role === 'gate') return '/ingreso';
  if (role === 'player') return '/padel';
  return '/cuenta';
}

export function afterLogin(value?: unknown) {
  if (!value || value === '/cuenta') return '/portal';
  return safeReturnTo(value);
}
