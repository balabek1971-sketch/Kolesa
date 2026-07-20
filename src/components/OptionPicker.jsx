import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";

export function OptionPicker({
  disabled = false,
  emptyMessage = "Варианты не найдены",
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

  function choose(nextValue) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
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

            <div className="option-picker-list">
              <button
                className={`option-picker-item option-picker-any${!value ? " active" : ""}`}
                type="button"
                onClick={() => choose("")}
              >
                <span>Неважно</span>
                <small>Пропустить этот параметр</small>
              </button>

              {visibleOptions.map((option) => (
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
