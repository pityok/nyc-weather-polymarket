# nyc-weather-polymarket

Production-ready API: NYC Weather × Polymarket.  
Стек: Node.js, TypeScript, Express, SQLite (Prisma), Zod, node-cron, Vitest.

## Требования

- Node.js >= 18
- npm или pnpm

## Установка

```bash
cp .env.example .env
npm install
npm run db:generate
```

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Запуск в режиме разработки (tsx watch) |
| `npm run build` | Сборка в `dist/` |
| `npm run start` | Запуск собранного приложения |
| `npm run test` | Тесты (Vitest, watch) |
| `npm run test:run` | Тесты один раз |
| `npm run lint` | ESLint по `src/` |
| `npm run db:generate` | Генерация Prisma Client |
| `npm run db:push` | Синхронизация схемы с SQLite |
| `npm run db:migrate` | Миграции (dev) |

## БД (SQLite + Prisma)

Модели:

- **ForecastRun** — прогон прогноза: runTimeUtc/Msk, targetDate, horizon (today|tomorrow|day2). Связи: modelForecasts, consensuses, edgeSignals.
- **ModelForecast** — прогноз одной модели: modelId/Name, confidence, rawResponse, probsJson (9 диапазонов), sumBeforeNormalization.
- **MarketSnapshot** — снимок рынка: targetDate, snapshotTimeUtc, snapshotType (current|fixed_1800_msk), probsJson, source.
- **Consensus** — консенсус по прогону: method (simple|weighted), probsJson.
- **EdgeSignal** — сигнал по диапазону: rangeKey, aiProb, marketProb, edge, recommendation (bet|no_bet), reason.
- **ActualOutcome** — фактический исход по дате: targetDate (unique), winningRangeKey, source.

Индексы: targetDate, snapshotType, createdAt (и комбинации) где нужно для выборок. После изменения схемы: `npm run db:generate` и `npm run db:push` (или `npm run db:migrate` для миграций).

## API

- **GET /health** — проверка работы сервиса. Ответ: `{ "ok": true }`.

## Структура

```
src/
  app.ts          — Express app
  server.ts       — точка входа
  config/         — конфигурация
  db/             — Prisma client
  types/          — общие типы
  adapters/       — внешние API
  llm/            — LLM-логика
  market/         — Polymarket
  weather/        — погода
  services/       — сервисы
  jobs/           — cron-задачи
  routes/         — маршруты
  utils/          — утилиты
prisma/
  schema.prisma   — схема БД
```

Бизнес-логика пока не добавлена.
