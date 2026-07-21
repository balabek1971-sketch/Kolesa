import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { popularModelCategories, popularModels } from "../data/popularModels.js";

export function PopularModels({ onChange }) {
  const [category, setCategory] = useState("all");

  const visibleModels = useMemo(() => {
    if (category === "all") return popularModels;
    return popularModels.filter((item) => item.category === category);
  }, [category]);

  function chooseModel(item) {
    onChange({
      category: "cars",
      body: item.category === "crossover" ? "Кроссовер" : "Седан",
      brand: item.brand,
      model: item.model,
      city: "",
      condition: "",
    });
  }

  return (
    <section className="popular-models" aria-labelledby="popular-models-title">
      <div className="popular-models-heading">
        <div>
          <p className="eyebrow">Выбирают чаще всего</p>
          <h2 id="popular-models-title">Популярные модели</h2>
        </div>
        <a href="#catalog">
          Все автомобили
          <ArrowRight aria-hidden="true" size={17} />
        </a>
      </div>

      <div className="popular-model-tabs" aria-label="Тип автомобиля">
        {popularModelCategories.map((item) => (
          <button
            className={category === item.value ? "active" : ""}
            type="button"
            aria-pressed={category === item.value}
            key={item.value}
            onClick={() => setCategory(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="popular-model-grid">
        {visibleModels.map((item) => (
          <a
            className="popular-model-card"
            href="#catalog"
            key={`${item.brand}-${item.model}`}
            onClick={() => chooseModel(item)}
          >
            <span className="popular-model-media">
              <img
                loading="lazy"
                decoding="async"
                src={item.image}
                alt={item.label}
                style={{ "--model-image-offset-y": item.imageOffsetY ?? "0px" }}
              />
            </span>
            <span className="popular-model-name">
              <span>{item.label}</span>
              <ArrowRight aria-hidden="true" size={17} strokeWidth={2.4} />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
