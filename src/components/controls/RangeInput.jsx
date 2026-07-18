export function RangeInput({ label, from, to, onFrom, onTo }) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <span className="range-pair">
        <input inputMode="numeric" value={from} placeholder="От" onChange={(event) => onFrom(event.target.value)} />
        <input inputMode="numeric" value={to} placeholder="До" onChange={(event) => onTo(event.target.value)} />
      </span>
    </label>
  );
}
