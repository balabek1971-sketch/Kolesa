export function ToggleCheck({ checked, label, onChange }) {
  return (
    <label className={`toggle-check${checked ? " is-selected" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
