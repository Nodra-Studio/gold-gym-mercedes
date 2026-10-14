/** Store and validate the same international WhatsApp number in the form and API. */
export function normalizePublicPhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}

export function isPublicPhone(value: string) {
  return /^\+?\d{8,15}$/.test(normalizePublicPhone(value));
}

export const publicPhoneMessage =
  "Ingresá un WhatsApp con código de país y entre 8 y 15 números.";
