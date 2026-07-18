import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export function AuthPanel({ configured, title = "Войдите в аккаунт" }) {
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const credentials = {
      email: form.get("email"),
      password: form.get("password")
    };

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setMessage(error.message);
    } else if (mode === "signup") {
      setMessage("Проверьте почту и подтвердите регистрацию.");
    }

    setSubmitting(false);
  }

  if (!configured) {
    return (
      <section className="auth-panel">
        <p className="eyebrow">Аккаунт</p>
        <h1>Авторизация временно недоступна</h1>
        <p>Добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` в настройках Vercel.</p>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <p className="eyebrow">Аккаунт</p>
      <h1>{title}</h1>
      <div className="auth-tabs" aria-label="Режим авторизации">
        <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
          Вход
        </button>
        <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
          Регистрация
        </button>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength="6"
            required
            placeholder="Минимум 6 символов"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Подождите..." : mode === "signin" ? "Войти" : "Создать аккаунт"}
        </button>
      </form>
      {message && <p className="auth-message" role="status">{message}</p>}
    </section>
  );
}
