import { useState } from "react";
import { supabase } from "../lib/supabase.js";

function normalizeKazakhstanPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `+7${digits}` : "";
}

function getLocalPhoneDigits(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

function formatLocalPhone(value) {
  const digits = getLocalPhoneDigits(value);
  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10)
  ].filter(Boolean).join(" ");
}

export function AuthPanel({ configured, title = "Войдите в аккаунт" }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    const normalizedPhone = normalizeKazakhstanPhone(phone);
    if (!normalizedPhone) {
      setMessage("Введите номер Казахстана в формате +7 700 000 00 00.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: { shouldCreateUser: true }
    });
    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setStep("code");
    setMessage("Код отправлен по SMS.");
  }

  async function verifyCode(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = String(form.get("code") || "").replace(/\D/g, "");
    if (token.length !== 6) {
      setMessage("Введите шестизначный код из SMS.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizeKazakhstanPhone(phone),
      token,
      type: "sms"
    });
    setSubmitting(false);
    if (error) setMessage(error.message);
  }

  if (!configured) {
    return (
      <section className="auth-panel">
        <p className="eyebrow">Аккаунт</p>
        <h1>Авторизация временно недоступна</h1>
        <p>Для сайта не заданы переменные подключения к Supabase.</p>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <p className="eyebrow">Аккаунт</p>
      <h1>{title}</h1>
      <p>Введите номер телефона — мы отправим код подтверждения по SMS.</p>

      {step === "phone" ? (
        <form className="auth-form" onSubmit={requestCode}>
          <label>
            Номер телефона
            <span className="phone-input-control">
              <span className="phone-prefix" aria-hidden="true">+7</span>
              <input
                name="phone"
                type="tel"
                aria-label="Номер телефона после +7"
                autoComplete="tel-national"
                inputMode="numeric"
                value={formatLocalPhone(phone)}
                onChange={(event) => setPhone(getLocalPhoneDigits(event.target.value))}
                required
                maxLength="13"
                placeholder="700 000 00 00"
              />
            </span>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Отправляем..." : "Получить код"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label>
            Код из SMS
            <input
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength="6"
              required
              autoFocus
              placeholder="000000"
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Проверяем..." : "Войти"}
          </button>
          <button className="auth-secondary" type="button" onClick={() => setStep("phone")}>
            Изменить номер
          </button>
        </form>
      )}

      {message && <p className="auth-message" role="status">{message}</p>}
    </section>
  );
}
