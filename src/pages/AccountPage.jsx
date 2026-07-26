import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CarFront,
  Clock3,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { AuthPanel } from "../components/AuthPanel.jsx";
import {
  deleteOwnListing,
  fetchOwnListings,
  publishListing,
  supabase,
} from "../lib/supabase.js";

const tabs = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные", statuses: ["active"] },
  { id: "moderation", label: "На модерации", statuses: ["pending_moderation", "media_processing"] },
  { id: "drafts", label: "Черновики", statuses: ["draft"] },
  { id: "rejected", label: "Требуют правок", statuses: ["rejected"] },
  { id: "archive", label: "Архив", statuses: ["sold", "expired", "archived", "deleted"] },
];

const statusDetails = {
  draft: { label: "Черновик", tone: "neutral" },
  media_processing: { label: "Обрабатываем медиа", tone: "warning" },
  pending_moderation: { label: "На модерации", tone: "warning" },
  active: { label: "Активно", tone: "success" },
  rejected: { label: "Нужны исправления", tone: "danger" },
  sold: { label: "Продано", tone: "neutral" },
  expired: { label: "Срок истёк", tone: "neutral" },
  archived: { label: "В архиве", tone: "neutral" },
  deleted: { label: "Удалено", tone: "neutral" },
};

const formatNumber = (value) => Number(value || 0).toLocaleString("ru-RU");
const formatDate = (value) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value))
  : "";

function AccountListing({ listing, busy, onDelete, onPublish }) {
  const status = statusDetails[listing.status] || statusDetails.draft;
  const canSubmit = ["draft", "rejected", "pending_moderation"].includes(listing.status);

  return (
    <article className="account-listing">
      <div className="account-listing-media">
        {listing.imageUrl
          ? <img src={listing.imageUrl} alt="" loading="lazy" />
          : <CarFront aria-hidden="true" size={38} strokeWidth={1.4} />}
      </div>

      <div className="account-listing-main">
        <div className="account-listing-heading">
          <div>
            <span className={`listing-status ${status.tone}`}>{status.label}</span>
            <h2>{listing.title}</h2>
          </div>
          <strong>{formatNumber(listing.price)} ₸</strong>
        </div>

        <p className="account-listing-meta">
          {listing.year} · {formatNumber(listing.mileage)} км · {listing.city}
        </p>
        <p className="account-listing-date">
          Создано {formatDate(listing.createdAt)}
        </p>

        {listing.rejectionReason && (
          <p className="listing-rejection">
            <strong>Причина:</strong> {listing.rejectionReason}
          </p>
        )}
      </div>

      <div className="account-listing-actions">
        <span>{listing.photoCount} фото{listing.videoCount ? ` · ${listing.videoCount} видео` : ""}</span>
        <div>
          {canSubmit && (
            <button className="listing-publish" type="button" disabled={busy} onClick={() => onPublish(listing.id)}>
              {busy ? <RefreshCw className="loading-icon" aria-hidden="true" size={16} /> : <Send aria-hidden="true" size={16} />}
              Опубликовать
            </button>
          )}
          <button
            className="listing-delete"
            type="button"
            title="Удалить объявление"
            aria-label={`Удалить объявление ${listing.title}`}
            disabled={busy}
            onClick={() => onDelete(listing)}
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function AccountPage({ auth }) {
  const [activeTab, setActiveTab] = useState("all");
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadListings = useCallback(async () => {
    if (!auth.session) return;
    setLoading(true);
    setError("");
    try {
      setListings(await fetchOwnListings());
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить объявления.");
    } finally {
      setLoading(false);
    }
  }, [auth.session]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const visibleListings = useMemo(() => {
    const tab = tabs.find((item) => item.id === activeTab);
    return tab?.statuses
      ? listings.filter((listing) => tab.statuses.includes(listing.status))
      : listings;
  }, [activeTab, listings]);

  const counts = useMemo(() => Object.fromEntries(tabs.map((tab) => [
    tab.id,
    tab.statuses
      ? listings.filter((listing) => tab.statuses.includes(listing.status)).length
      : listings.length,
  ])), [listings]);

  async function handlePublish(listingId) {
    setBusyId(listingId);
    setError("");
    try {
      await publishListing(listingId);
      await loadListings();
      setActiveTab("active");
    } catch (submitError) {
      setError(submitError.message || "Не удалось опубликовать объявление.");
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(listing) {
    const confirmed = window.confirm(`Удалить объявление «${listing.title}»? Восстановить его будет нельзя.`);
    if (!confirmed) return;

    setBusyId(listing.id);
    setError("");
    try {
      await deleteOwnListing(listing.id);
      setListings((current) => current.filter((item) => item.id !== listing.id));
    } catch (deleteError) {
      setError(deleteError.message || "Не удалось удалить объявление.");
    } finally {
      setBusyId("");
    }
  }

  if (auth.loading) {
    return <main className="standalone-page"><p className="page-status">Загружаем аккаунт...</p></main>;
  }

  if (!auth.session) {
    return (
      <main className="standalone-page">
        <AuthPanel configured={auth.configured} />
      </main>
    );
  }

  return (
    <main className="standalone-page account-page">
      <section className="account-dashboard">
        <header className="account-dashboard-head">
          <div>
            <p className="eyebrow">Личный кабинет</p>
            <h1>Мои объявления</h1>
            <p>{auth.session.user.phone || "Пользователь QazAuto"}</p>
          </div>
          <div className="account-dashboard-actions">
            <a href="#/sell"><Plus aria-hidden="true" size={17} />Новое объявление</a>
            <button type="button" onClick={() => supabase.auth.signOut()}>
              <LogOut aria-hidden="true" size={17} />Выйти
            </button>
          </div>
        </header>

        <nav className="account-tabs" aria-label="Статусы объявлений">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.id === "archive" && <Archive aria-hidden="true" size={15} />}
              {tab.id === "moderation" && <Clock3 aria-hidden="true" size={15} />}
              {tab.label}<span>{counts[tab.id] || 0}</span>
            </button>
          ))}
        </nav>

        {error && <p className="account-error" role="alert">{error}</p>}

        {loading ? (
          <p className="account-empty"><RefreshCw className="loading-icon" aria-hidden="true" size={20} />Загружаем объявления...</p>
        ) : visibleListings.length ? (
          <div className="account-listings">
            {visibleListings.map((listing) => (
              <AccountListing
                busy={busyId === listing.id}
                key={listing.id}
                listing={listing}
                onDelete={handleDelete}
                onPublish={handlePublish}
              />
            ))}
          </div>
        ) : (
          <div className="account-empty">
            <CarFront aria-hidden="true" size={34} strokeWidth={1.4} />
            <strong>Здесь пока нет объявлений</strong>
            <p>Выберите другой раздел или разместите новый автомобиль.</p>
          </div>
        )}
      </section>
    </main>
  );
}
