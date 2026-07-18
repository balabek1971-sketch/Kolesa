export function MarketInsights({ listings }) {
  const segments = [
    ["Кроссоверы", listings.filter((item) => item.body === "Кроссовер").length],
    ["Седаны", listings.filter((item) => item.body === "Седан").length],
    ["Новые авто", listings.filter((item) => item.condition === "new").length],
    ["Кредит", listings.filter((item) => item.canFinance).length]
  ];
  const max = Math.max(...segments.map((item) => item[1]), 1);

  return (
    <section className="insights" id="insights">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Рынок</p>
          <h2>Спрос и наполнение</h2>
        </div>
      </div>
      <div className="bars">
        {segments.map(([label, value]) => (
          <div className="bar" key={label}>
            <strong>{label}</strong>
            <span className="track">
              <span className="fill" style={{ width: `${(value / max) * 100}%` }} />
            </span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
