import { formatMileage, formatPrice } from "../lib/format.js";

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
          {listings.map((listing) => (
            <article className="carCard" key={listing.id}>
              <div className="carImage" style={{ "--paint": listing.color }}>
                <span className="carShape" aria-hidden="true" />
                <button
                  className={favorites.has(listing.id) ? "favorite active" : "favorite"}
                  type="button"
                  aria-label="Добавить в избранное"
                  onClick={() => onFavoriteToggle(listing.id)}
                >
                  ♥
                </button>
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
