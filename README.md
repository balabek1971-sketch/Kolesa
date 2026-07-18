# QazAuto Market React

React MVP маркетплейса авто для Казахстана.

## Архитектура

- `src/App.jsx` - orchestration состояния приложения.
- `src/components` - UI-компоненты: поиск, каталог, форма продажи, аналитика.
- `src/components/controls` - переиспользуемые контролы поиска.
- `src/data` - демо-данные и справочники.
- `src/lib/search.js` - чистая логика фильтрации и сортировки.
- `src/lib/supabase.js` - клиент и будущие запросы к Supabase.
- `supabase/schema.sql` - структура базы и RLS-политики.

## Локальный запуск

```bash
npm install
npm run dev
```

## Vercel

1. Загрузить проект в GitHub.
2. Импортировать репозиторий в Vercel.
3. Framework preset: Vite.
4. Добавить переменные из `.env.example`.
5. Deploy.

## Supabase

1. Создать проект Supabase.
2. Выполнить `supabase/schema.sql` в SQL Editor.
3. Включить Auth по телефону/email, когда будем делать реальные кабинеты.
4. Создать Storage bucket `listing-photos` для фотографий объявлений.

## Следующие архитектурные шаги

1. Подключить реальные `fetchListings` вместо `initialListings`.
2. Добавить авторизацию продавцов и дилеров.
3. Добавить страницы объявления и профиля продавца.
4. Ввести модерацию и платные продвижения.
