const popularOptions = [
  { label: "Седаны", patch: { category: "cars", body: "Седан", condition: "" } },
  { label: "Кроссоверы", patch: { category: "cars", body: "Кроссовер", condition: "" } },
  { label: "Внедорожники", patch: { category: "cars", body: "Внедорожник", condition: "" } },
  { label: "Лифтбеки", patch: { category: "", body: "Лифтбек", condition: "" } },
  { label: "Новые авто", patch: { category: "", body: "", condition: "new" } },
  { label: "Мотоциклы", patch: { category: "moto", body: "", condition: "" } },
  { label: "Катера", patch: { category: "water", body: "", condition: "" } }
];

export function PopularBrowse({ filters, onChange }) {
  function chooseOption(patch) {
    onChange({
      ...patch,
      brand: "",
      model: "",
      city: ""
    });
  }

  return (
    <section className="popular-browse" aria-labelledby="popular-title">
      <div className="popular-heading">
        <h2 id="popular-title">Популярные категории</h2>
        <a href="#catalog" onClick={() => chooseOption({ category: "", body: "", condition: "" })}>
          Все автомобили <span aria-hidden="true">›</span>
        </a>
      </div>
      <div className="popular-buttons">
        {popularOptions.map((option) => {
          const active =
            filters.category === option.patch.category &&
            filters.body === option.patch.body &&
            filters.condition === option.patch.condition;

          return (
            <a
              className={active ? "active" : ""}
              href="#catalog"
              key={option.label}
              onClick={() => chooseOption(option.patch)}
            >
              {option.label}
            </a>
          );
        })}
      </div>
    </section>
  );
}
