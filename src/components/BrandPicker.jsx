import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { brands, popularBrands } from "../data/brands.js";

const letters = [...new Set(brands.map((brand) => brand[0].toLocaleUpperCase("ru-KZ")))];

export function BrandPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  const visibleBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-KZ");
    return brands.filter((brand) => {
      const matchesQuery = !normalizedQuery || brand.toLocaleLowerCase("ru-KZ").includes(normalizedQuery);
      const matchesLetter = !letter || brand[0].toLocaleUpperCase("ru-KZ") === letter;
      return matchesQuery && matchesLetter;
    });
  }, [letter, query]);

  const groups = useMemo(() => {
    return visibleBrands.reduce((result, brand) => {
      const key = brand[0].toLocaleUpperCase("ru-KZ");
      if (!result[key]) result[key] = [];
      result[key].push(brand);
      return result;
    }, {});
  }, [visibleBrands]);

  function chooseBrand(brand) {
    onChange(brand);
    setOpen(false);
    setQuery("");
    setLetter("");
  }

  return (
    <>
      <button ref={triggerRef} className="brand-trigger" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{value || "Выберите марку"}</span>
        <ChevronDown aria-hidden="true" size={17} />
      </button>

      {open && createPortal(
        <div className="brand-picker-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="brand-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brand-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="brand-picker-head">
              <div>
                <p className="eyebrow">Каталог марок</p>
                <h2 id="brand-picker-title">Выберите марку</h2>
              </div>
              <button className="brand-picker-close" type="button" aria-label="Закрыть" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            <label className="brand-search">
              <Search aria-hidden="true" size={19} />
              <input
                autoFocus
                type="search"
                aria-label="Поиск марки"
                placeholder="Начните вводить название"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLetter("");
                }}
              />
            </label>

            <div className="popular-brand-row">
              <button className={!value ? "active" : ""} type="button" onClick={() => chooseBrand("")}>
                Все марки
              </button>
              {popularBrands.map((brand) => (
                <button className={value === brand ? "active" : ""} key={brand} type="button" onClick={() => chooseBrand(brand)}>
                  {brand}
                </button>
              ))}
            </div>

            <div className="brand-alphabet" aria-label="Фильтр по первой букве">
              <button className={!letter ? "active" : ""} type="button" onClick={() => setLetter("")}>Все</button>
              {letters.map((item) => (
                <button className={letter === item ? "active" : ""} key={item} type="button" onClick={() => {
                  setLetter(item);
                  setQuery("");
                }}>
                  {item}
                </button>
              ))}
            </div>

            <div className="brand-groups">
              {Object.entries(groups).map(([groupLetter, groupBrands]) => (
                <section className="brand-group" key={groupLetter}>
                  <h3>{groupLetter}</h3>
                  <div>
                    {groupBrands.map((brand) => (
                      <button className={value === brand ? "active" : ""} key={brand} type="button" onClick={() => chooseBrand(brand)}>
                        {brand}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {!visibleBrands.length && <p className="brand-empty">Марка не найдена</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
