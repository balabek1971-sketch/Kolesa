import { useState } from "react";
import { getConsentChoice, saveConsentChoice } from "../lib/analytics.js";

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !getConsentChoice());
  if (!visible) return null;

  function choose(personalization) {
    saveConsentChoice(personalization);
    setVisible(false);
  }

  return (
    <aside className="cookie-consent" aria-label="Настройки рекомендаций">
      <div>
        <strong>Персональные рекомендации</strong>
        <p>С разрешения запомним просмотры, поиски и избранное, чтобы точнее подбирать автомобили.</p>
      </div>
      <div>
        <button type="button" onClick={() => choose(false)}>Только необходимые</button>
        <button className="accept" type="button" onClick={() => choose(true)}>Разрешить</button>
      </div>
    </aside>
  );
}
