export function RangeInput({ label, from, to, onFrom, onTo }) {
  return (
    <label className="rangeField">
      <span>{label}</span>
      <span className="rangePair">
        <input inputMode="numeric" value={from} placeholder="от" onChange={(event) => onFrom(event.target.value)} />
        <input inputMode="numeric" value={to} placeholder="до" onChange={(event) => onTo(event.target.value)} />
      </span>
    </label>
  );
}
