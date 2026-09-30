/** Normalize common Ghana phone formats so customer order history stays linked. */
export function normalizeCustomerPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^2330\d{9}$/.test(digits)) return `233${digits.slice(4)}`;
  return digits;
}
