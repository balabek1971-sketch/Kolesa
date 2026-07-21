import { X } from "lucide-react";
import { ToggleCheck } from "./controls/ToggleCheck.jsx";
import {
  bodyTypes,
  colors,
  engineTypes,
  gearboxTypes,
  originCountries
} from "../data/filterOptions.js";

function ClearableSelect({ children, label, onChange, value }) {
  return (
    <div className="advanced-select-control">
      <select
        aria-label={label}
        className={value ? "is-selected" : ""}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {value && (
        <button
          className="advanced-select-clear"
          type="button"
          aria-label={`Очистить поле «${label}»`}
          onClick={() => onChange("")}
        >
          <X aria-hidden="true" size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function AdvancedFilters({ filters, onChange }) {
  return (
    <div className="advanced-filters">
      <div className="advanced-grid">
        <div className="advanced-field">
          <span>Страна происхождения</span>
          <ClearableSelect label="Страна происхождения" value={filters.originCountry} onChange={(originCountry) => onChange({ originCountry })}>
            <option value="">Неважно</option>
            {originCountries.map((country) => <option key={country} value={country}>{country}</option>)}
          </ClearableSelect>
        </div>

        <div className="advanced-field">
          <span>Кузов</span>
          <ClearableSelect label="Кузов" value={filters.body} onChange={(body) => onChange({ body })}>
            <option value="">Любой кузов</option>
            {bodyTypes.map((body) => <option key={body} value={body}>{body}</option>)}
          </ClearableSelect>
        </div>

        <div className="advanced-field">
          <span>Тип двигателя</span>
          <ClearableSelect label="Тип двигателя" value={filters.engineType} onChange={(engineType) => onChange({ engineType })}>
            <option value="">Любой двигатель</option>
            {engineTypes.map((engine) => <option key={engine} value={engine}>{engine}</option>)}
          </ClearableSelect>
        </div>

        <div className="advanced-field">
          <span>КПП</span>
          <ClearableSelect label="КПП" value={filters.gearbox} onChange={(gearbox) => onChange({ gearbox })}>
            <option value="">Любая КПП</option>
            {gearboxTypes.map((gearbox) => <option key={gearbox} value={gearbox}>{gearbox}</option>)}
          </ClearableSelect>
        </div>

        <div className="advanced-field">
          <span>Расположение руля</span>
          <ClearableSelect label="Расположение руля" value={filters.steering} onChange={(steering) => onChange({ steering })}>
            <option value="">Неважно</option>
            <option value="Левый">Левый</option>
            <option value="Правый">Правый</option>
          </ClearableSelect>
        </div>

        <div className="advanced-field">
          <span>Привод</span>
          <ClearableSelect label="Привод" value={filters.drivetrain} onChange={(drivetrain) => onChange({ drivetrain })}>
            <option value="">Любой привод</option>
            <option value="Передний">Передний</option>
            <option value="Задний">Задний</option>
            <option value="Полный">Полный</option>
          </ClearableSelect>
        </div>

        <fieldset className="advanced-field availability-field">
          <legend>Наличие</legend>
          <div className="availability-control">
            <button
              className={!filters.availability || filters.availability === "in_stock" ? "active" : ""}
              type="button"
              onClick={() => onChange({ availability: "in_stock" })}
            >
              В наличии
            </button>
            <button
              className={filters.availability === "order" ? "active" : ""}
              type="button"
              onClick={() => onChange({ availability: "order" })}
            >
              На заказ
            </button>
          </div>
        </fieldset>

        <fieldset className="advanced-field engine-volume-field">
          <legend>Объём двигателя, л</legend>
          <div className="range-control">
            <input
              className={filters.engineVolumeFrom ? "is-selected" : ""}
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="от"
              value={filters.engineVolumeFrom}
              onChange={(event) => onChange({ engineVolumeFrom: event.target.value })}
            />
            <input
              className={filters.engineVolumeTo ? "is-selected" : ""}
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="до"
              value={filters.engineVolumeTo}
              onChange={(event) => onChange({ engineVolumeTo: event.target.value })}
            />
          </div>
        </fieldset>

        <div className="advanced-field color-field">
          <span>Цвет</span>
          <ClearableSelect label="Цвет" value={filters.colorName} onChange={(colorName) => onChange({ colorName })}>
            <option value="">Неважно</option>
            {colors.map((color) => <option key={color} value={color}>{color}</option>)}
          </ClearableSelect>
          <div className="color-options">
            <ToggleCheck
              checked={filters.metallic}
              label="Металлик"
              onChange={(metallic) => onChange({ metallic })}
            />
            <ToggleCheck
              checked={filters.dealerOnly}
              label="Только от дилеров"
              onChange={(dealerOnly) => onChange({ dealerOnly })}
            />
          </div>
        </div>

        <label className="advanced-field keyword-field">
          <span>Поиск по ключевым словам</span>
          <input
            className={filters.keyword ? "is-selected" : ""}
            type="search"
            placeholder="Например: Camry 2.5"
            value={filters.keyword}
            onChange={(event) => onChange({ keyword: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
