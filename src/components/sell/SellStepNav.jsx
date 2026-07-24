import {
  BadgeCheck,
  Camera,
  CarFront,
  CircleDollarSign,
  SlidersHorizontal,
} from "lucide-react";

const steps = [
  { label: "Автомобиль", hint: "Марка, модель и год", icon: CarFront },
  { label: "Характеристики", hint: "Кузов, двигатель и привод", icon: SlidersHorizontal },
  { label: "Продажа", hint: "Цена, город и описание", icon: CircleDollarSign },
  { label: "Фото и видео", hint: "Материалы объявления", icon: Camera },
  { label: "Проверка", hint: "Отправка на модерацию", icon: BadgeCheck },
];

export const sellSteps = steps;

export function SellStepNav({ activeStep, onChange, unlockedStep }) {
  return (
    <nav className="sell-step-nav" aria-label="Этапы объявления">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const available = index <= unlockedStep;
        const complete = index < activeStep;

        return (
          <button
            className={[
              "sell-step-button",
              index === activeStep ? "active" : "",
              complete ? "complete" : "",
            ].filter(Boolean).join(" ")}
            disabled={!available}
            key={step.label}
            type="button"
            onClick={() => onChange(index)}
          >
            <span className="sell-step-number">{complete ? "✓" : index + 1}</span>
            <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            <span>
              <strong>{step.label}</strong>
              <small>{step.hint}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
