import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  LoaderCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import { bodyTypes, colors, engineTypes, gearboxTypes, originCountries } from "../data/filterOptions.js";
import { loadVehicleCatalog } from "../lib/vehicleCatalog.js";
import { BrandPicker } from "./BrandPicker.jsx";
import { CityPicker } from "./CityPicker.jsx";
import { OptionPicker } from "./OptionPicker.jsx";
import { GroupedNumberInput } from "./controls/GroupedNumberInput.jsx";
import { SellMediaStep } from "./sell/SellMediaStep.jsx";
import { SellStepNav, sellSteps } from "./sell/SellStepNav.jsx";

const currentYear = new Date().getFullYear();
const optionList = (values) => values.map((value) => ({ label: value, value }));
const bodyOptions = optionList(bodyTypes);
const engineOptions = optionList(engineTypes);
const gearboxOptions = optionList(gearboxTypes);
const colorOptions = optionList(colors);
const originOptions = optionList(originCountries);
const drivetrainOptions = optionList(["Передний", "Задний", "Полный"]);
const steeringOptions = optionList(["Слева", "Справа"]);

const initialValues = {
  condition: "used",
  brand: "",
  model: "",
  year: "",
  mileage: "",
  body: "",
  engineType: "",
  engineVolume: "",
  gearbox: "",
  drivetrain: "",
  steering: "Слева",
  originCountry: "",
  city: "",
  price: "",
  colorName: "",
  metallic: false,
  cleared: true,
  damaged: false,
  hasVehicleHistory: false,
  title: "",
  description: "",
};

function requiredByStep(step, values, photos) {
  if (step === 0) return Boolean(values.brand && values.model && values.year);
  if (step === 1) return Boolean(values.body && values.gearbox && values.engineType);
  if (step === 2) return Boolean(values.city && Number(values.price) > 0);
  if (step === 3) return photos.length > 0;
  return true;
}

function readablePhone(phone) {
  if (!phone) return "номер подтверждён";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return phone;
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

function SelectField({ label, children, optional = false }) {
  return (
    <label className="sell-field">
      <span>
        {label}
        {optional && <small>необязательно</small>}
      </span>
      <span className="sell-field-control">{children}</span>
    </label>
  );
}

export function SellForm({ onSubmit, userPhone }) {
  const [activeStep, setActiveStep] = useState(0);
  const [unlockedStep, setUnlockedStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [catalogState, setCatalogState] = useState({ brand: "", catalog: null, loading: false });
  const [message, setMessage] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  useEffect(() => {
    if (!values.brand) {
      setCatalogState({ brand: "", catalog: null, loading: false });
      return undefined;
    }

    let active = true;
    setCatalogState({ brand: values.brand, catalog: null, loading: true });
    loadVehicleCatalog(values.brand)
      .then((catalog) => {
        if (active) setCatalogState({ brand: values.brand, catalog, loading: false });
      })
      .catch(() => {
        if (active) setCatalogState({ brand: values.brand, catalog: null, loading: false });
      });

    return () => {
      active = false;
    };
  }, [values.brand]);

  useEffect(() => () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
  }, []);

  const catalog = catalogState.brand === values.brand ? catalogState.catalog : null;
  const modelOptions = useMemo(
    () => (catalog?.models || []).map((model) => ({ label: model.name, value: model.name })),
    [catalog],
  );
  const generatedTitle = [values.brand, values.model, values.year].filter(Boolean).join(" ");

  function patch(patchValues) {
    setValues((current) => ({ ...current, ...patchValues }));
    setMessage("");
  }

  function goNext() {
    if (!requiredByStep(activeStep, values, photos)) {
      const messages = [
        "Выберите марку, модель и укажите год выпуска.",
        "Укажите кузов, тип двигателя и коробку передач.",
        "Выберите город и укажите цену.",
        "Добавьте хотя бы одну фотографию.",
      ];
      setMessage(messages[activeStep] || "Заполните обязательные поля.");
      return;
    }

    const next = Math.min(activeStep + 1, sellSteps.length - 1);
    setActiveStep(next);
    setUnlockedStep((current) => Math.max(current, next));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMessage("");

    try {
      const listingId = await onSubmit({
        ...values,
        title: values.title.trim() || generatedTitle,
        price: Number(values.price),
        year: Number(values.year),
        mileage: Number(values.mileage || 0),
        engineVolume: values.engineVolume ? Number(values.engineVolume) : null,
        photos: photos.map((photo) => photo.file),
        video: video?.file || null,
      }, ({ kind, index, progress }) => {
        const percent = Math.round(progress * 100);
        setUploadStatus(kind === "photo"
          ? `Фото ${index + 1} из ${photos.length}: ${percent}%`
          : `Видео: ${percent}%`);
      });
      setSubmittedId(listingId);
    } catch (error) {
      setMessage(error.message || "Не удалось сохранить объявление.");
    } finally {
      setSubmitting(false);
      setUploadStatus("");
    }
  }

  if (submittedId) {
    return (
      <section className="sell sell-success">
        <BadgeCheck aria-hidden="true" size={54} strokeWidth={1.6} />
        <p className="eyebrow">Заявка принята</p>
        <h1>Объявление на модерации</h1>
        <p>Все фотографии и видео загружены. Мы сообщим о результате проверки в личном кабинете.</p>
        <strong>Номер объявления: {submittedId}</strong>
        <a href="#/account">Перейти в аккаунт</a>
      </section>
    );
  }

  return (
    <section className="sell sell-editor">
      <header className="sell-editor-head">
        <div>
          <p className="eyebrow">Продажа автомобиля</p>
          <h1>Новое объявление</h1>
        </div>
        <span className="sell-auth-status">
          <ShieldCheck aria-hidden="true" size={18} />
          {readablePhone(userPhone)}
        </span>
      </header>

      <div className="sell-editor-layout">
        <SellStepNav activeStep={activeStep} unlockedStep={unlockedStep} onChange={setActiveStep} />

        <form className="sell-form-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="sell-mobile-progress">
            <span>Шаг {activeStep + 1} из {sellSteps.length}</span>
            <strong>{sellSteps[activeStep].label}</strong>
            <i style={{ "--progress": `${((activeStep + 1) / sellSteps.length) * 100}%` }} />
          </div>

          {activeStep === 0 && (
            <div className="sell-stage">
              <div className="sell-stage-heading">
                <p className="eyebrow">Шаг 1</p>
                <h2>Какой автомобиль продаёте?</h2>
                <p>Выберите данные из каталога. Это ускорит проверку и сделает поиск точнее.</p>
              </div>

              <fieldset className="sell-segmented">
                <legend>Состояние</legend>
                <button className={values.condition === "used" ? "active" : ""} type="button" onClick={() => patch({ condition: "used" })}>
                  С пробегом
                </button>
                <button className={values.condition === "new" ? "active" : ""} type="button" onClick={() => patch({ condition: "new", mileage: "0" })}>
                  Новый
                </button>
              </fieldset>

              <div className="sell-field-grid two-columns">
                <SelectField label="Марка">
                  <BrandPicker value={values.brand} onChange={(brand) => patch({ brand, model: "" })} />
                </SelectField>
                <SelectField label="Модель">
                  <OptionPicker
                    disabled={!values.brand}
                    groupByInitial
                    label="Выберите модель"
                    loading={catalogState.loading}
                    options={modelOptions}
                    placeholder={values.brand ? "Выберите модель" : "Сначала выберите марку"}
                    value={values.model}
                    onChange={(model) => patch({ model })}
                  />
                </SelectField>
                <SelectField label="Год выпуска">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1900"
                    max={currentYear + 1}
                    placeholder={String(currentYear)}
                    value={values.year}
                    onChange={(event) => patch({ year: event.target.value })}
                  />
                </SelectField>
                {values.condition === "used" && (
                  <SelectField label="Пробег, км">
                    <GroupedNumberInput
                      placeholder="Например, 85 000"
                      value={values.mileage}
                      onValueChange={(mileage) => patch({ mileage })}
                    />
                  </SelectField>
                )}
              </div>
            </div>
          )}

          {activeStep === 1 && (
            <div className="sell-stage">
              <div className="sell-stage-heading">
                <p className="eyebrow">Шаг 2</p>
                <h2>Характеристики</h2>
                <p>Заполненные параметры помогут покупателям быстрее найти автомобиль.</p>
              </div>

              <div className="sell-field-grid two-columns">
                <SelectField label="Кузов">
                  <OptionPicker label="Кузов" options={bodyOptions} placeholder="Выберите кузов" value={values.body} onChange={(body) => patch({ body })} />
                </SelectField>
                <SelectField label="Тип двигателя">
                  <OptionPicker label="Тип двигателя" options={engineOptions} placeholder="Выберите двигатель" value={values.engineType} onChange={(engineType) => patch({ engineType })} />
                </SelectField>
                <SelectField label="Коробка передач">
                  <OptionPicker label="Коробка передач" options={gearboxOptions} placeholder="Выберите коробку" value={values.gearbox} onChange={(gearbox) => patch({ gearbox })} />
                </SelectField>
                <SelectField label="Привод" optional>
                  <OptionPicker label="Привод" options={drivetrainOptions} placeholder="Выберите привод" value={values.drivetrain} onChange={(drivetrain) => patch({ drivetrain })} />
                </SelectField>
                <SelectField label="Руль" optional>
                  <OptionPicker label="Расположение руля" options={steeringOptions} placeholder="Выберите руль" value={values.steering} onChange={(steering) => patch({ steering })} />
                </SelectField>
                <SelectField label="Объём двигателя, л" optional>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="20"
                    step="0.1"
                    placeholder="Например, 2.5"
                    value={values.engineVolume}
                    onChange={(event) => patch({ engineVolume: event.target.value })}
                  />
                </SelectField>
                <SelectField label="Страна происхождения" optional>
                  <OptionPicker label="Страна происхождения" options={originOptions} placeholder="Выберите страну" value={values.originCountry} onChange={(originCountry) => patch({ originCountry })} />
                </SelectField>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="sell-stage">
              <div className="sell-stage-heading">
                <p className="eyebrow">Шаг 3</p>
                <h2>Цена и описание</h2>
                <p>Контактный номер берём из подтверждённого аккаунта и не показываем до публикации.</p>
              </div>

              <div className="sell-field-grid two-columns">
                <SelectField label="Город">
                  <CityPicker value={values.city} onChange={(city) => patch({ city })} />
                </SelectField>
                <SelectField label="Цена, ₸">
                  <GroupedNumberInput
                    placeholder="Например, 14 500 000"
                    value={values.price}
                    onValueChange={(price) => patch({ price })}
                  />
                </SelectField>
                <SelectField label="Цвет" optional>
                  <OptionPicker label="Цвет" options={colorOptions} placeholder="Выберите цвет" value={values.colorName} onChange={(colorName) => patch({ colorName })} />
                </SelectField>
                <SelectField label="Название" optional>
                  <input
                    maxLength="120"
                    placeholder={generatedTitle || "Название объявления"}
                    value={values.title}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </SelectField>
              </div>

              <div className="sell-check-row">
                <label className={values.metallic ? "active" : ""}>
                  <input type="checkbox" checked={values.metallic} onChange={(event) => patch({ metallic: event.target.checked })} />
                  Металлик
                </label>
                <label className={values.cleared ? "active" : ""}>
                  <input type="checkbox" checked={values.cleared} onChange={(event) => patch({ cleared: event.target.checked })} />
                  Растаможен
                </label>
                <label className={values.hasVehicleHistory ? "active" : ""}>
                  <input type="checkbox" checked={values.hasVehicleHistory} onChange={(event) => patch({ hasVehicleHistory: event.target.checked })} />
                  Есть история авто
                </label>
                <label className={values.damaged ? "danger active" : "danger"}>
                  <input type="checkbox" checked={values.damaged} onChange={(event) => patch({ damaged: event.target.checked })} />
                  Аварийный / не на ходу
                </label>
              </div>

              <label className="sell-field sell-description">
                <span>Описание <small>необязательно</small></span>
                <textarea
                  maxLength="10000"
                  rows="6"
                  placeholder="Расскажите о состоянии, обслуживании и особенностях автомобиля"
                  value={values.description}
                  onChange={(event) => patch({ description: event.target.value })}
                />
                <small>{values.description.length} / 10 000</small>
              </label>
            </div>
          )}

          {activeStep === 3 && (
            <SellMediaStep photos={photos} onPhotosChange={setPhotos} video={video} onVideoChange={setVideo} />
          )}

          {activeStep === 4 && (
            <div className="sell-stage sell-review">
              <div className="sell-stage-heading">
                <p className="eyebrow">Шаг 5</p>
                <h2>Проверьте объявление</h2>
                <p>После отправки данные и материалы пройдут автоматическую и ручную модерацию.</p>
              </div>

              <div className="sell-review-hero">
                {photos[0] ? <img src={photos[0].previewUrl} alt="Обложка объявления" /> : <span>Нет фото</span>}
                <div>
                  <p>{values.condition === "new" ? "Новый автомобиль" : "Автомобиль с пробегом"}</p>
                  <h3>{values.title.trim() || generatedTitle}</h3>
                  <strong>{Number(values.price).toLocaleString("ru-RU")} ₸</strong>
                </div>
              </div>

              <dl className="sell-review-list">
                <div><dt>Город</dt><dd>{values.city}</dd></div>
                <div><dt>Год</dt><dd>{values.year}</dd></div>
                <div><dt>Пробег</dt><dd>{Number(values.mileage || 0).toLocaleString("ru-RU")} км</dd></div>
                <div><dt>Кузов</dt><dd>{values.body}</dd></div>
                <div><dt>Двигатель</dt><dd>{[values.engineType, values.engineVolume && `${values.engineVolume} л`].filter(Boolean).join(", ")}</dd></div>
                <div><dt>Коробка</dt><dd>{values.gearbox}</dd></div>
                <div><dt>Медиа</dt><dd>{photos.length} фото{video ? ", 1 видео" : ""}</dd></div>
                <div><dt>Телефон</dt><dd>{readablePhone(userPhone)}</dd></div>
              </dl>

              <div className="moderation-note">
                <ShieldCheck aria-hidden="true" size={22} />
                <div>
                  <strong>Безопасная публикация</strong>
                  <p>Черновик принадлежит только вашему аккаунту. Объявление появится в поиске после модерации.</p>
                </div>
              </div>
            </div>
          )}

          {message && <p className="sell-message" role="alert">{message}</p>}

          <footer className="sell-form-actions">
            <button
              className="sell-back"
              type="button"
              disabled={activeStep === 0 || submitting}
              onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft aria-hidden="true" size={18} />
              Назад
            </button>

            {activeStep < sellSteps.length - 1 ? (
              <button className="sell-next" type="button" onClick={goNext}>
                Продолжить
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            ) : (
              <button className="sell-submit" type="button" disabled={submitting} onClick={handleSubmit}>
                {submitting
                  ? <LoaderCircle className="loading-icon" aria-hidden="true" size={19} />
                  : <Send aria-hidden="true" size={19} />}
                {submitting ? uploadStatus || "Отправляем..." : "Отправить на модерацию"}
              </button>
            )}
          </footer>
        </form>
      </div>
    </section>
  );
}
