import { ToggleCheck } from "./controls/ToggleCheck.jsx";
import {
  bodyTypes,
  colors,
  engineTypes,
  gearboxTypes,
  originCountries
} from "../data/filterOptions.js";

export function AdvancedFilters({ filters, onChange }) {
  return (
    <div className="advanced-filters">
      <div className="advanced-grid">
        <label className="advanced-field">
          <span>Страна происхождения</span>
          <select value={filters.originCountry} onChange={(event) => onChange({ originCountry: event.target.value })}>
            <option value="">Неважно</option>
            {originCountries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
        </label>

        <label className="advanced-field">
          <span>Кузов</span>
          <select value={filters.body} onChange={(event) => onChange({ body: event.target.value })}>
            <option value="">Любой кузов</option>
            {bodyTypes.map((body) => <option key={body} value={body}>{body}</option>)}
          </select>
        </label>

        <label className="advanced-field">
          <span>Тип двигателя</span>
          <select value={filters.engineType} onChange={(event) => onChange({ engineType: event.target.value })}>
            <option value="">Любой двигатель</option>
            {engineTypes.map((engine) => <option key={engine} value={engine}>{engine}</option>)}
          </select>
        </label>

        <label className="advanced-field">
          <span>КПП</span>
          <select value={filters.gearbox} onChange={(event) => onChange({ gearbox: event.target.value })}>
            <option value="">Любая КПП</option>
            {gearboxTypes.map((gearbox) => <option key={gearbox} value={gearbox}>{gearbox}</option>)}
          </select>
        </label>

        <label className="advanced-field">
          <span>Расположение руля</span>
          <select value={filters.steering} onChange={(event) => onChange({ steering: event.target.value })}>
            <option value="">Неважно</option>
            <option value="Левый">Левый</option>
            <option value="Правый">Правый</option>
          </select>
        </label>

        <label className="advanced-field">
          <span>Привод</span>
          <select value={filters.drivetrain} onChange={(event) => onChange({ drivetrain: event.target.value })}>
            <option value="">Любой привод</option>
            <option value="Передний">Передний</option>
            <option value="Задний">Задний</option>
            <option value="Полный">Полный</option>
          </select>
        </label>

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
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="от"
              value={filters.engineVolumeFrom}
              onChange={(event) => onChange({ engineVolumeFrom: event.target.value })}
            />
            <input
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
          <select value={filters.colorName} onChange={(event) => onChange({ colorName: event.target.value })}>
            <option value="">Неважно</option>
            {colors.map((color) => <option key={color} value={color}>{color}</option>)}
          </select>
          <ToggleCheck
            checked={filters.metallic}
            label="Металлик"
            onChange={(metallic) => onChange({ metallic })}
          />
        </div>

        <div className="advanced-checkboxes">
          <ToggleCheck
            checked={filters.dealerOnly}
            label="Только от дилеров"
            onChange={(dealerOnly) => onChange({ dealerOnly })}
          />
        </div>

        <label className="advanced-field keyword-field">
          <span>Поиск по ключевым словам</span>
          <input
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
