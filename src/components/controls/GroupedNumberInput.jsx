import { useState } from "react";

function normalizeNumber(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
}

function formatNumber(value) {
  const normalized = normalizeNumber(value);
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function GroupedNumberInput({ onValueChange, value, ...props }) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState("");
  const rawValue = controlled ? value : internalValue;

  function handleChange(event) {
    const nextValue = normalizeNumber(event.target.value);
    if (!controlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9 ]*"
      value={formatNumber(rawValue)}
      onChange={handleChange}
    />
  );
}
