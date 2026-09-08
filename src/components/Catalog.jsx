import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { CatalogFiltersDialog } from "./CatalogFiltersDialog.jsx";
import { ListingReportDialog } from "./ListingReportDialog.jsx";
import { formatMileage, formatPrice } from "../lib/format.js";

const reportHoldMilliseconds = 600;
const reportHoldMovement = 12;

function CatalogCard({ favorite, index, listing, onFavoriteToggle, onReport }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef(0);
  const showImage = listing.imageUrl && !imageFailed;

  useEffect(() => () => {
    window.clearTimeout(holdRef.current?.timer);
    window.clearTimeout(suppressTimerRef.current);
  }, []);

  function cancelHold() {
    window.clearTimeout(holdRef.current?.timer);
    holdRef.current = null;
    setHolding(false);
  }

  function openReport() {
    suppressClickRef.current = true;
    window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 900);
    setHolding(false);
    navigator.vibrate?.(20);
    onReport(listing);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest("button, input, select, textarea")) return;
    cancelHold();
    setHolding(true);
    holdRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        holdRef.current = null;
        openReport();
      }, reportHoldMilliseconds),
    };
  }

  function handlePointerMove(event) {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - hold.startX, event.clientY - hold.startY) > reportHoldMovement) {
      cancelHold();
    }
  }

  function handleClickCapture(event) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  function handleContextMenu(event) {
    if (event.target.closest("button, input, select, textarea")) return;
    event.preventDefault();
    cancelHold();
    openReport();
  }

  return (
    <article
      className={holding ? "carCard report-hold-active" : "carCard"}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
      onPointerCancel={cancelHold}
      onPointerDown={handlePointerDown}
      onPointerLeave={cancelHold}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelHold}
    >
      <a className="carCardLink" href={`#/cars/${listing.id}`} aria-label={`Открыть объявление ${listing.title}`} draggable="false">
        <div className="carImage" style={{ "--paint": listing.color }}>
          {showImage ? (
            <img
              src={listing.imageUrl}
              alt={listing.title}
              draggable="false"
              loading={index < 8 ? "eager" : "lazy"}
              fetchpriority={index < 4 ? "high" : "auto"}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="carShape" aria-hidden="true" />
          )}
        </div>
        <div className="carBody">
          <div className="carTitle">
            <h3>{listing.title}</h3>
            <strong>{formatPrice(listing.price)}</strong>
          </div>
          <div className="meta">
            <span>{listing.year}</span>
            <span>{formatMileage(listing.mileage)}</span>
            <span>{listing.body}</span>
            <span>{listing.gearbox}</span>
          </div>
          <div className="sellerLine">
            <span>{listing.city}</span>
            <b>{listing.seller}</b>
          </div>
        </div>
      </a>
      <button
        className={favorite ? "favorite active" : "favorite"}
        type="button"
        aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}
        onClick={() => onFavoriteToggle(listing.id)}
      >
        ♥
      </button>
    </article>
  );
}

export function Catalog({
  allListings,
  authenticated = false,
  favorites,
  filters,
  listings,
  onFavoriteToggle,
  onFiltersChange,
  onSortChange,
  sort,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportListing, setReportListing] = useState(null);
  const [reportFeedback, setReportFeedback] = useState("");
  const feedbackTimerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), []);

  function openReport(listing) {
    if (!authenticated) {
      window.location.hash = "/account";
      return;
    }
    setReportListing(listing);
  }

  function showReportFeedback() {
    setReportFeedback("Жалоба отправлена администратору");
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setReportFeedback(""), 2400);
  }

  return (
    <section className="catalog" id="catalog">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Каталог</p>
          <h2>Авто в продаже</h2>
        </div>
        <div className="catalog-head-actions">
          {filters && onFiltersChange && (
            <button className="catalog-filter-open" type="button" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden="true" size={18} />
              <span>Фильтр</span>
            </button>
          )}
          <select value={sort} onChange={(event) => onSortChange(event.target.value)} aria-label="Сортировка">
            <option value="recommended">Рекомендованные</option>
            <option value="priceAsc">Цена по возрастанию</option>
            <option value="priceDesc">Цена по убыванию</option>
            <option value="yearDesc">Сначала новые</option>
          </select>
        </div>
      </div>

      {listings.length === 0 ? (
        <p className="emptyState">Под выбранные фильтры пока нет авто.</p>
      ) : (
        <div className="listingGrid">
          {listings.map((listing, index) => (
            <CatalogCard
              favorite={favorites.has(listing.id)}
              index={index}
              key={listing.id}
              listing={listing}
              onFavoriteToggle={onFavoriteToggle}
              onReport={openReport}
            />
          ))}
        </div>
      )}

      <ListingReportDialog
        listingId={reportListing?.id}
        listingTitle={reportListing?.title}
        open={Boolean(reportListing)}
        onClose={() => setReportListing(null)}
        onSubmitted={showReportFeedback}
      />
      {filtersOpen && filters && onFiltersChange && (
        <CatalogFiltersDialog
          filters={filters}
          listings={allListings || listings}
          onApply={onFiltersChange}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {reportFeedback && <p className="catalog-report-toast" role="status">{reportFeedback}</p>}
    </section>
  );
}
