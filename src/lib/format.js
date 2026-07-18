export function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-KZ").format(value)} ₸`;
}

export function formatMileage(value) {
  return value === 0 ? "без пробега" : `${new Intl.NumberFormat("ru-KZ").format(value)} км`;
}
