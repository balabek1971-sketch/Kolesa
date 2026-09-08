import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CarFront,
  Eye,
  EyeOff,
  Flag,
  Heart,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AuthPanel } from "../components/AuthPanel.jsx";
import {
  fetchAdminActivity,
  fetchAdminDashboardStats,
  fetchAdminReports,
  reviewAdminReport,
  setAdminListingVisibility,
} from "../lib/supabase.js";
import { formatKazakhstanPhone } from "../lib/phone.js";

const reportReasons = {
  not_vehicle: "Объявление не об автомобиле",
  fraud: "Подозрение на мошенничество",
  wrong_information: "Неверные данные",
  duplicate: "Дубликат объявления",
  other: "Другая причина",
};

const reportStatuses = {
  open: "Новая",
  reviewed: "Проверена",
  dismissed: "Отклонена",
  actioned: "Объявление скрыто",
};

const filters = [
  { id: "open", label: "Новые" },
  { id: "all", label: "Все" },
  { id: "reviewed", label: "Проверенные" },
  { id: "dismissed", label: "Отклонённые" },
  { id: "actioned", label: "Со скрытием" },
];

const formatNumber = (value) => Number(value || 0).toLocaleString("ru-RU");
const formatDate = (value) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))
  : "";
const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "";

function Metric({ icon: Icon, label, value, accent = false }) {
  return (
    <div className={accent ? "admin-metric accent" : "admin-metric"}>
      <Icon aria-hidden="true" size={20} />
      <div>
        <strong>{formatNumber(value)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function AdminPage({ access, auth }) {
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeFilter, setActiveFilter] = useState("open");
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!auth.session || !access.allowed) return;
    setLoading(true);
    setError("");
    try {
      const [nextStats, nextActivity, nextReports] = await Promise.all([
        fetchAdminDashboardStats(),
        fetchAdminActivity(14),
        fetchAdminReports(activeFilter),
      ]);
      setStats(nextStats);
      setActivity(nextActivity);
      setReports(nextReports);
      setNotes(Object.fromEntries(nextReports.map((report) => [report.id, report.adminNote])));
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить админ-панель.");
    } finally {
      setLoading(false);
    }
  }, [access.allowed, activeFilter, auth.session]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activityTotals = useMemo(() => activity.reduce((totals, day) => ({
    registrations: totals.registrations + day.registrations,
    listings: totals.listings + day.listings,
    reports: totals.reports + day.reports,
    events: totals.events + day.events,
  }), { registrations: 0, listings: 0, reports: 0, events: 0 }), [activity]);

  async function updateReport(report, status) {
    setBusyId(report.id);
    setError("");
    try {
      await reviewAdminReport(report.id, status, notes[report.id] || "");
      await loadDashboard();
    } catch (updateError) {
      setError(updateError.message || "Не удалось обновить жалобу.");
    } finally {
      setBusyId("");
    }
  }

  async function changeListingVisibility(report, visible) {
    const action = visible ? "вернуть объявление в каталог" : "скрыть объявление из каталога";
    if (!window.confirm(`Точно ${action}?`)) return;

    const reason = (notes[report.id] || "").trim() || `Жалоба: ${reportReasons[report.reason] || report.reason}`;
    setBusyId(report.id);
    setError("");
    try {
      await setAdminListingVisibility({
        listingId: report.listingId,
        visible,
        reason,
        reportId: report.id,
      });
      await loadDashboard();
    } catch (updateError) {
      setError(updateError.message || "Не удалось изменить видимость объявления.");
    } finally {
      setBusyId("");
    }
  }

  if (auth.loading || access.loading) {
    return <main className="standalone-page"><p className="page-status">Проверяем доступ...</p></main>;
  }

  if (!auth.session) {
    return <main className="standalone-page"><AuthPanel configured={auth.configured} /></main>;
  }

  if (!access.allowed) {
    return (
      <main className="standalone-page">
        <section className="admin-access-denied">
          <ShieldCheck aria-hidden="true" size={40} strokeWidth={1.5} />
          <h1>Доступ только администратору</h1>
          <p>Этот аккаунт не имеет административной роли.</p>
          <a href="#/account"><ArrowLeft aria-hidden="true" size={17} />Вернуться в профиль</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="eyebrow">QazAuto Admin</p>
            <h1>Управление площадкой</h1>
            <p>{formatKazakhstanPhone(auth.session.user.phone)}</p>
          </div>
          <div>
            <a href="#/account"><ArrowLeft aria-hidden="true" size={17} />В профиль</a>
            <button type="button" disabled={loading} onClick={loadDashboard}>
              <RefreshCw className={loading ? "loading-icon" : ""} aria-hidden="true" size={17} />Обновить
            </button>
          </div>
        </header>

        {error && <p className="admin-error" role="alert">{error}</p>}

        <section className="admin-metrics" aria-label="Основная статистика">
          <Metric icon={Users} label="пользователей" value={stats.registered_users} />
          <Metric icon={Activity} label="активных за 24 часа" value={stats.active_visitors_24h} />
          <Metric icon={CarFront} label="всего объявлений" value={stats.total_listings} />
          <Metric icon={CarFront} label="активных объявлений" value={stats.active_listings} />
          <Metric accent icon={Flag} label="новых жалоб" value={stats.open_reports} />
          <Metric icon={EyeOff} label="скрыто администратором" value={stats.admin_hidden_listings} />
          <Metric icon={MessageCircle} label="сообщений" value={stats.messages_total} />
          <Metric icon={Heart} label="добавлений в избранное" value={stats.favorites_total} />
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Активность за 14 дней</h2>
              <p>{formatNumber(activityTotals.registrations)} регистраций, {formatNumber(activityTotals.listings)} объявлений, {formatNumber(activityTotals.events)} действий</p>
            </div>
          </div>
          <div className="admin-activity-scroll">
            <table className="admin-activity-table">
              <thead>
                <tr><th>Дата</th><th>Регистрации</th><th>Объявления</th><th>Жалобы</th><th>События</th><th>Сообщения</th><th>Избранное</th></tr>
              </thead>
              <tbody>
                {[...activity].reverse().map((day) => (
                  <tr key={day.date}>
                    <td>{formatDate(day.date)}</td>
                    <td>{formatNumber(day.registrations)}</td>
                    <td>{formatNumber(day.listings)}</td>
                    <td>{formatNumber(day.reports)}</td>
                    <td>{formatNumber(day.events)}</td>
                    <td>{formatNumber(day.messages)}</td>
                    <td>{formatNumber(day.favorites)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section admin-reports-section">
          <div className="admin-section-heading">
            <div>
              <h2>Жалобы на объявления</h2>
              <p>Жалобы сами ничего не блокируют. Решение всегда принимает администратор.</p>
            </div>
          </div>

          <nav className="admin-report-filters" aria-label="Фильтр жалоб">
            {filters.map((filter) => (
              <button className={activeFilter === filter.id ? "active" : ""} type="button" key={filter.id} onClick={() => setActiveFilter(filter.id)}>
                {filter.label}{filter.id === "open" && <span>{formatNumber(stats.open_reports)}</span>}
              </button>
            ))}
          </nav>

          {loading && !reports.length ? (
            <p className="admin-reports-empty"><RefreshCw className="loading-icon" aria-hidden="true" size={20} />Загружаем жалобы...</p>
          ) : reports.length ? (
            <div className="admin-report-list">
              {reports.map((report) => (
                <article className="admin-report" key={report.id}>
                  <a className="admin-report-media" href={`#/cars/${report.listingId}`} aria-label={`Открыть ${report.listingTitle}`}>
                    {report.listingImageUrl
                      ? <img src={report.listingImageUrl} alt="" loading="lazy" />
                      : <CarFront aria-hidden="true" size={34} strokeWidth={1.4} />}
                  </a>
                  <div className="admin-report-main">
                    <div className="admin-report-title">
                      <div>
                        <span className={`admin-report-status ${report.status}`}>{reportStatuses[report.status] || report.status}</span>
                        <a href={`#/cars/${report.listingId}`}>{report.listingTitle}</a>
                      </div>
                      <time>{formatDateTime(report.createdAt)}</time>
                    </div>
                    <strong className="admin-report-reason">{reportReasons[report.reason] || report.reason}</strong>
                    {report.details && <p className="admin-report-details">{report.details}</p>}
                    <p className="admin-report-author">Отправил: {report.reporterName} · {report.reporterPhone || "номер скрыт"}</p>
                    <label className="admin-report-note">
                      <span>Комментарий администратора</span>
                      <textarea
                        value={notes[report.id] || ""}
                        maxLength={2000}
                        placeholder="Необязательно; при скрытии сюда запишется причина"
                        onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="admin-report-actions">
                    {report.listingAdminHidden ? (
                      <button className="restore" type="button" disabled={busyId === report.id} onClick={() => changeListingVisibility(report, true)}>
                        <Eye aria-hidden="true" size={16} />Вернуть объявление
                      </button>
                    ) : (
                      <button className="hide" type="button" disabled={busyId === report.id} onClick={() => changeListingVisibility(report, false)}>
                        <EyeOff aria-hidden="true" size={16} />Скрыть объявление
                      </button>
                    )}
                    <button type="button" disabled={busyId === report.id} onClick={() => updateReport(report, "reviewed")}>Проверено</button>
                    <button type="button" disabled={busyId === report.id} onClick={() => updateReport(report, "dismissed")}>Отклонить жалобу</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-reports-empty"><ShieldCheck aria-hidden="true" size={25} />В этом разделе жалоб нет.</p>
          )}
        </section>
      </div>
    </main>
  );
}
