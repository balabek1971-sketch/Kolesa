import { AuthPanel } from "../components/AuthPanel.jsx";
import { SellForm } from "../components/SellForm.jsx";

export function SellPage({ auth, onSubmit }) {
  if (auth.loading) {
    return <main className="standalone-page"><p className="page-status">Проверяем аккаунт...</p></main>;
  }

  return (
    <main className="standalone-page">
      {auth.session ? (
        <SellForm onSubmit={onSubmit} userPhone={auth.session.user.phone} />
      ) : (
        <AuthPanel
          configured={auth.configured}
          title="Войдите, чтобы разместить объявление"
        />
      )}
    </main>
  );
}
