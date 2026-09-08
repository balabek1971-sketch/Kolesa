export const ADMIN_PHONE_E164 = "+77000000000";

export function getLocalPhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length > 10 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function normalizeKazakhstanPhone(value) {
  const digits = getLocalPhoneDigits(value);
  return digits.length === 10 ? `+7${digits}` : "";
}

export function formatLocalPhone(value) {
  const digits = getLocalPhoneDigits(value);
  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10)
  ].filter(Boolean).join(" ");
}

export function formatKazakhstanPhone(value) {
  const local = formatLocalPhone(value);
  return local.length === 13 ? `+7 ${local}` : String(value || "");
}

export function isAdminPhone(value) {
  return normalizeKazakhstanPhone(value) === ADMIN_PHONE_E164;
}
