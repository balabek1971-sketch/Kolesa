import { useState } from "react";

function normalizeMoney(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
}

function formatMoney(value) {
  const normalized = normalizeMoney(value);
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function MoneyInput({ onValueChange, value, ...props }) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState("");
  const rawValue = controlled ? value : internalValue;

  function handleChange(event) {
    const nextValue = normalizeMoney(event.target.value);
    if (!controlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9 ]*"
      value={formatMoney(rawValue)}
      onChange={handleChange}
    />
  );
}
