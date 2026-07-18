export function SellForm({ onSubmit, userEmail }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      id: `listing-${Date.now()}`,
      title: form.get("title"),
      brand: form.get("brand"),
      model: form.get("model"),
      category: "cars",
      city: form.get("city"),
      price: Number(form.get("price")),
      year: Number(form.get("year")),
      mileage: Number(form.get("mileage")),
      condition: form.get("condition"),
      body: form.get("body"),
      gearbox: form.get("gearbox"),
      seller: "Новое объявление",
      color: "#0f8b8d",
      hasPhoto: true,
      canFinance: false,
      cleared: true,
      damaged: false,
      score: 99
    });
    event.currentTarget.reset();
  }

  return (
    <section className="sell">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Продавцам</p>
          <h2>Разместить объявление</h2>
          <p className="signed-in-as">Вы вошли как {userEmail}</p>
        </div>
      </div>
      <form className="sellForm" onSubmit={handleSubmit}>
        <label>Марка<input name="brand" required placeholder="Toyota" /></label>
        <label>Модель<input name="model" required placeholder="Camry" /></label>
        <label>Название<input name="title" required placeholder="Toyota Camry 75" /></label>
        <label>Город<input name="city" required placeholder="Алматы" /></label>
        <label>Цена, ₸<input name="price" required type="number" min="1" placeholder="14500000" /></label>
        <label>Год<input name="year" required type="number" min="1990" max="2027" placeholder="2021" /></label>
        <label>Пробег, км<input name="mileage" required type="number" min="0" placeholder="52000" /></label>
        <label>Кузов<input name="body" required placeholder="Седан" /></label>
        <label>Коробка<input name="gearbox" required placeholder="Автомат" /></label>
        <label>
          Состояние
          <select name="condition" required defaultValue="used">
            <option value="used">С пробегом</option>
            <option value="new">Новая</option>
          </select>
        </label>
        <button type="submit">Добавить демо-объявление</button>
      </form>
    </section>
  );
}
