import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  Check,
  Gauge,
  Heart,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { formatMileage, formatPrice } from "../lib/format.js";
import { fetchListingById } from "../lib/supabase.js";

function readablePhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return phone;
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

function valueOrDash(value) {
  return value || "Не указано";
}

export function ListingPage({ fallbackListing, favorite, listingId, onFavoriteToggle }) {
  const [listing, setListing] = useState(fallbackListing || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchListingById(listingId)
      .then((result) => {
        if (!active) return;
        if (!result) {
          if (!fallbackListing) setError("Объявление не найдено или уже снято с публикации.");
          return;
        }
        setListing(result);
        setSelectedMediaId(result.media[0]?.id || "");
      })
      .catch((loadError) => {
        if (active && !fallbackListing) {
          setError(loadError.message || "Не удалось загрузить объявление.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fallbackListing, listingId]);

  const media = listing?.media || [];
  const selectedMedia = useMemo(
    () => media.find((item) => item.id === selectedMediaId) || media[0],
    [media, selectedMediaId],
  );

  if (loading && !listing) {
    return <main className="listing-detail-page"><p className="page-status">Загружаем объявление...</p></main>;
  }

  if (error || !listing) {
    return (
      <main className="listing-detail-page">
        <section className="listing-not-found">
          <CarFront aria-hidden="true" size={42} strokeWidth={1.4} />
          <h1>Объявление недоступно</h1>
          <p>{error || "Возможно, автомобиль уже продан или объявление удалено."}</p>
          <a href="#catalog"><ArrowLeft aria-hidden="true" size={17} />Вернуться в каталог</a>
        </section>
      </main>
    );
  }

  const phone = readablePhone(listing.phone);
  const phoneHref = listing.phone ? `tel:${listing.phone.replace(/[^\d+]/g, "")}` : "";
  const facts = [
    ["Год выпуска", listing.year],
    ["Пробег", formatMileage(listing.mileage)],
    ["Кузов", valueOrDash(listing.body)],
    ["Коробка", valueOrDash(listing.gearbox)],
    ["Двигатель", [listing.engineType, listing.engineVolume && `${listing.engineVolume} л`].filter(Boolean).join(", ") || "Не указано"],
    ["Привод", valueOrDash(listing.drivetrain)],
    ["Руль", valueOrDash(listing.steering)],
    ["Цвет", [listing.colorName, listing.metallic && "металлик"].filter(Boolean).join(", ") || "Не указано"],
    ["Страна происхождения", valueOrDash(listing.originCountry)],
    ["Растаможен", listing.cleared ? "Да" : "Нет"],
  ];

  return (
    <main className="listing-detail-page">
      <div className="listing-detail-shell">
        <a className="listing-back" href="#catalog">
          <ArrowLeft aria-hidden="true" size={17} />
          Назад к объявлениям
        </a>

        <div className="listing-detail-grid">
          <section className="listing-gallery" aria-label="Фотографии и видео автомобиля">
            <div className="listing-main-media">
              {selectedMedia?.kind === "video" ? (
                <video controls playsInline preload="metadata" poster={selectedMedia.posterUrl || undefined}>
                  <source src={selectedMedia.url} type={selectedMedia.mimeType || "video/mp4"} />
                </video>
              ) : selectedMedia?.url ? (
                <img src={selectedMedia.url} alt={listing.title} fetchPriority="high" />
              ) : (
                <span className="listing-media-empty"><CarFront aria-hidden="true" size={64} strokeWidth={1.2} /></span>
              )}
            </div>

            {media.length > 1 && (
              <div className="listing-thumbnails">
                {media.map((item, index) => (
                  <button
                    className={item.id === selectedMedia?.id ? "active" : ""}
                    key={item.id}
                    type="button"
                    aria-label={item.kind === "video" ? "Показать видео" : `Показать фото ${index + 1}`}
                    onClick={() => setSelectedMediaId(item.id)}
                  >
                    {item.kind === "video" ? (
                      <video muted playsInline preload="metadata" src={item.url} />
                    ) : (
                      <img src={item.url} alt="" loading="lazy" />
                    )}
                    {item.kind === "video" && <span>Видео</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="listing-summary">
            <div className="listing-summary-head">
              <div>
                <p className="eyebrow">Автомобиль в продаже</p>
                <h1>{listing.title}</h1>
              </div>
              <button
                className={favorite ? "detail-favorite active" : "detail-favorite"}
                type="button"
                aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}
                onClick={() => onFavoriteToggle(listing.id)}
              >
                <Heart aria-hidden="true" size={22} fill={favorite ? "currentColor" : "none"} />
              </button>
            </div>

            <strong className="listing-price">{formatPrice(listing.price)}</strong>
            <div className="listing-quick-facts">
              <span><CalendarDays aria-hidden="true" size={17} />{listing.year}</span>
              <span><Gauge aria-hidden="true" size={17} />{formatMileage(listing.mileage)}</span>
              <span><MapPin aria-hidden="true" size={17} />{listing.city}</span>
            </div>

            <div className="listing-seller">
              <span>Продавец</span>
              <strong>{listing.seller}</strong>
              {phoneHref ? (
                <a href={phoneHref}><Phone aria-hidden="true" size={18} />{phone}</a>
              ) : (
                <p>Телефон не указан</p>
              )}
            </div>

            <p className="listing-safety">
              <ShieldCheck aria-hidden="true" size={19} />
              Не переводите предоплату до осмотра автомобиля и документов.
            </p>
          </aside>
        </div>

        <section className="listing-specifications">
          <h2>Характеристики</h2>
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="listing-flags">
            {listing.hasVehicleHistory && <span><Check aria-hidden="true" size={15} />Есть история автомобиля</span>}
            {listing.damaged && <span className="danger">Аварийный / не на ходу</span>}
          </div>
        </section>

        <section className="listing-description">
          <h2>Описание продавца</h2>
          <p>{listing.description || "Продавец не добавил описание."}</p>
        </section>
      </div>
    </main>
  );
}
