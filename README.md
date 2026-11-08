# Lektionen Trainer (PWA)

- `index.html` — выбор уровня
- `trainer.html?level=a1&lektion=1` — единая страница тренажёра для всех уровней
- `js/levels.js` — список уровней и названия уроков
- `data/*.js` — слова (a1, a2, b1)
- `sw.js` — офлайн-кэш; при изменении списка файлов меняйте `CACHE`

## Добавить уровень (например B2)
1. Создайте `data/b2.js` (`const dictionary = { "Урок 1": [...], ... }`).
2. В `js/levels.js` замените запись b2 на `{ "name": "B2", "lessons": ["название 1", ...] }` (уберите `soon`).
3. Добавьте `./data/b2.js` в `ASSETS` в `sw.js` и поднимите версию кэша.

## Публикация
GitHub Pages: Settings → Pages → ветка main, корень. Все пути относительные.
