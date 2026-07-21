import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";

const optionCollator = new Intl.Collator("ru-KZ", {
  numeric: true,
  sensitivity: "base",
});

function getGroupKey(label) {
  const firstCharacter = label.trim()[0];
  if (!firstCharacter || !/[\p{L}\p{N}]/u.test(firstCharacter)) return "#";
  return firstCharacter.toLocaleUpperCase("ru-KZ");
}

export function OptionPicker({
  disabled = false,
  emptyMessage = "Варианты не найдены",
  groupByInitial = false,
  label,
  loading = false,
  onChange,
  options,
  placeholder,
  value,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef(null);
  const selected = options.find((option) => option.value === value);

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

  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-KZ");
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.meta || ""}`.toLocaleLowerCase("ru-KZ").includes(normalizedQuery));
  }, [options, query]);

  const groupedOptions = useMemo(() => {
    if (!groupByInitial) return [];

    const groups = visibleOptions.reduce((result, option) => {
      const key = getGroupKey(option.label);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(option);
      return result;
    }, new Map());

    return [...groups.entries()]
      .sort(([left], [right]) => optionCollator.compare(left, right));
  }, [groupByInitial, visibleOptions]);

  function choose(nextValue) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  function clearValue() {
    onChange("");
    setQuery("");
    triggerRef.current?.focus();
  }

  return (
    <>
      <div className="catalog-control">
        <button
          ref={triggerRef}
          className="catalog-trigger"
          type="button"
          aria-haspopup="dialog"
          disabled={disabled || loading}
          onClick={() => setOpen(true)}
        >
          <span>{loading ? "Загрузка..." : selected?.label || placeholder}</span>
          {loading
            ? <LoaderCircle className="loading-icon" aria-hidden="true" size={17} />
            : <ChevronDown aria-hidden="true" size={17} />}
        </button>
        {selected && (
          <button className="catalog-clear" type="button" aria-label={`Убрать модель ${selected.label}`} onClick={clearValue}>
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {open && createPortal(
        <div className="option-picker-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="option-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="option-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="option-picker-head">
              <div>
                <p className="eyebrow">Необязательный параметр</p>
                <h2 id="option-picker-title">{label}</h2>
              </div>
              <button className="option-picker-close" type="button" aria-label="Закрыть" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            <label className="option-search">
              <Search aria-hidden="true" size={19} />
              <input
                autoFocus
                type="search"
                aria-label={`Поиск: ${label}`}
                placeholder="Начните вводить название"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className={`option-picker-list${groupByInitial ? " grouped" : ""}`}>
              <button
                className={`option-picker-item option-picker-any${!value ? " active" : ""}`}
                type="button"
                onClick={() => choose("")}
              >
                <span>Неважно</span>
                <small>Пропустить этот параметр</small>
                {!value && <Check className="option-picker-check" aria-hidden="true" size={16} strokeWidth={2.5} />}
              </button>

              {groupByInitial
                ? groupedOptions.map(([groupKey, groupOptions]) => {
                  const seriesOption = /^\d$/.test(groupKey)
                    ? groupOptions.find((option) =>
                      option.label.toLocaleLowerCase("ru-KZ") === `${groupKey} серия`)
                    : null;
                  const listedOptions = seriesOption
                    ? groupOptions.filter((option) => option !== seriesOption)
                    : groupOptions;

                  return (
                    <section className="option-picker-group" key={groupKey}>
                      <h3>
                        {seriesOption
                          ? (
                            <button
                              className={`option-picker-group-title${seriesOption.value === value ? " active" : ""}`}
                              type="button"
                              onClick={() => choose(seriesOption.value)}
                            >
                              {seriesOption.label}
                            </button>
                          )
                          : groupKey}
                      </h3>
                      <div className="option-picker-group-items">
                        {listedOptions.map((option) => (
                          <button
                            className={`option-picker-item${option.value === value ? " active" : ""}`}
                            key={option.value}
                            type="button"
                            onClick={() => choose(option.value)}
                          >
                            <span>{option.label}</span>
                            {option.meta && <small>{option.meta}</small>}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })
                : visibleOptions.map((option) => (
                  <button
                    className={`option-picker-item${option.value === value ? " active" : ""}`}
                    key={option.value}
                    type="button"
                    onClick={() => choose(option.value)}
                  >
                    <span>{option.label}</span>
                    {option.meta && <small>{option.meta}</small>}
                  </button>
                ))}

              {!visibleOptions.length && <p className="option-picker-empty">{emptyMessage}</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
