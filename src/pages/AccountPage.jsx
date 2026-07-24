import { AuthPanel } from "../components/AuthPanel.jsx";
import { supabase } from "../lib/supabase.js";

export function AccountPage({ auth }) {
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
    <main className="standalone-page">
      <section className="account-panel">
        <p className="eyebrow">Личный кабинет</p>
        <h1>Ваш аккаунт</h1>
        <p>{auth.session.user.phone || auth.session.user.email || "Пользователь QazAuto"}</p>
        <div className="account-actions">
          <a href="#/sell">Разместить объявление</a>
          <button type="button" onClick={() => supabase.auth.signOut()}>Выйти</button>
        </div>
      </section>
    </main>
  );
}
