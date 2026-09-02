import { useState } from "react";
import { formatMileage, formatPrice } from "../lib/format.js";

function CatalogCard({ favorite, index, listing, onFavoriteToggle }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = listing.imageUrl && !imageFailed;

  return (
    <article className="carCard">
      <a className="carCardLink" href={`#/cars/${listing.id}`} aria-label={`Открыть объявление ${listing.title}`}>
        <div className="carImage" style={{ "--paint": listing.color }}>
          {showImage ? (
            <img
              src={listing.imageUrl}
              alt={listing.title}
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

export function Catalog({ listings, favorites, sort, onSortChange, onFavoriteToggle }) {
  return (
    <section className="catalog" id="catalog">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Каталог</p>
          <h2>Авто в продаже</h2>
        </div>
        <select value={sort} onChange={(event) => onSortChange(event.target.value)} aria-label="Сортировка">
          <option value="recommended">Рекомендованные</option>
          <option value="priceAsc">Цена по возрастанию</option>
          <option value="priceDesc">Цена по убыванию</option>
          <option value="yearDesc">Сначала новые</option>
        </select>
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
            />
          ))}
        </div>
      )}
    </section>
  );
}
