import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { submitListingReport } from "../lib/supabase.js";

const reportReasons = [
  { id: "not_vehicle", label: "Объявление не об автомобиле" },
  { id: "fraud", label: "Подозрение на мошенничество" },
  { id: "wrong_information", label: "Неверные данные объявления" },
  { id: "duplicate", label: "Дубликат объявления" },
  { id: "other", label: "Другая причина" },
];

export function ListingReportDialog({ listingId, listingTitle = "", onClose, onSubmitted, open }) {
  const titleId = useId();
  const [reason, setReason] = useState("not_vehicle");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setReason("not_vehicle");
    setDetails("");
    setError("");

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [listingId, open]);

  useEffect(() => {
    if (!open) return undefined;
    const visualViewport = window.visualViewport;
    let focusFrame = 0;

    function updateViewport() {
      setViewport(visualViewport
        ? { height: visualViewport.height, top: visualViewport.offsetTop }
        : null);

      const activeField = document.activeElement;
      if (activeField?.closest(".listing-report-dialog")) {
        window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => {
          activeField.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }

    updateViewport();
    window.addEventListener("keydown", handleKeyDown);
    visualViewport?.addEventListener("resize", updateViewport);
    visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      visualViewport?.removeEventListener("resize", updateViewport);
      visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [busy, onClose, open]);

  if (!open || !listingId) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submitListingReport(listingId, reason, reason === "other" ? details : "");
      onSubmitted?.();
      onClose();
    } catch (submitError) {
      setError(submitError.message || "Не удалось отправить жалобу.");
    } finally {
      setBusy(false);
    }
  }

  const viewportStyle = viewport
    ? { bottom: "auto", height: `${viewport.height}px`, top: `${viewport.top}px` }
    : undefined;

  return (
    <div
      className="listing-report-overlay"
      role="presentation"
      style={viewportStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="listing-report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <p className="eyebrow">Жалоба</p>
            <h2 id={titleId}>Что не так с объявлением?</h2>
            {listingTitle && <span>{listingTitle}</span>}
          </div>
          <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="listing-report-form-scroll">
            <fieldset>
              <legend>Выберите причину</legend>
              {reportReasons.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="report-reason"
                    value={item.id}
                    checked={reason === item.id}
                    onChange={() => setReason(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>

            {reason === "other" && (
              <label className="listing-report-details">
                <span>Опишите проблему</span>
                <textarea
                  value={details}
                  minLength={10}
                  maxLength={1000}
                  required
                  autoFocus
                  placeholder="Не менее 10 символов"
                  onChange={(event) => setDetails(event.target.value)}
                />
              </label>
            )}

            <p className="listing-report-note">Жалоба попадёт администратору. Объявление не будет скрыто автоматически.</p>
            {error && <p className="listing-report-error" role="alert">{error}</p>}
          </div>

          <footer>
            <button type="button" disabled={busy} onClick={onClose}>Отмена</button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Отправляем..." : "Отправить жалобу"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
