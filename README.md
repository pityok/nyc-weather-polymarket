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
- **POST /forecast-runs** — создать forecast run вручную по payload.
- **POST /forecast-runs/trigger** — вручную триггернуть job-пайплайн. Ответ: `202` + `started/skipped/error`.
- **GET /forecast-runs/latest** — получить последний forecast run (или `404`, если нет записей).
- **GET /forecast-runs?limit=20&offset=0** — список run’ов с пагинацией и счетчиками дочерних сущностей.
- **GET /forecast-runs/summary?runId=...** — summary по edge signals (или по всем run’ам, если `runId` не указан).
- **GET /forecast-runs/:id** — получить forecast run с дочерними сущностями.
- **GET /dashboard/snapshot** — агрегированный snapshot для дашборда (`run + summary + meta`, опционально `history`).
  - query: `runId?`, `includeHistory?` (default `false`), `historyLimit?` (1..50, default `10`)
  - пример: `/dashboard/snapshot?includeHistory=true&historyLimit=5`
- **GET /api/summary?date=YYYY-MM-DD** — forecasts, consensus, market(current/fixed), signals.
- **GET /api/runs?date=YYYY-MM-DD** — прогоны по дате.
- **GET /api/market?date=YYYY-MM-DD&type=current|fixed_1800_msk** — market snapshots.
- **GET /api/signals?date=YYYY-MM-DD** — edge signals по дате.
- **GET /api/backtest?from=YYYY-MM-DD&to=YYYY-MM-DD** — базовые backtest-метрики.

## Cron / job

При старте сервера поднимается scheduler (timezone: `Europe/Moscow`).

- `FORECAST_JOB_ENABLED=true|false` — включить/выключить планировщик
- `FORECAST_CRON` — legacy параметр (оставлен для совместимости)

Расписание (MSK):
- `00:00, 06:00, 12:00, 18:00` — сбор forecast run для `today`, `tomorrow`, `day2`
- каждые `10 минут` — refresh market snapshots (`current`)
- `18:00` — сохранение fixed snapshot (`fixed_1800_msk`)

Логи пишутся с timestamp в UTC и MSK.

Для ручного запуска без ожидания cron используй `POST /forecast-runs/trigger`.

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

## Архитектура (кратко)

- **adapters/**: LLM adapters (единый контракт)
- **llm/**: парсинг ответа моделей
- **market/**: mapper Polymarket -> 9 диапазонов
- **services/**: pipeline, dashboard snapshot, edge logic, backtest, market snapshots
- **jobs/**: cron orchestration (MSK timezone)
- **routes/**: REST API + dashboard snapshot
- **db/**: Prisma repositories
- **types/**: Zod-схемы и DTO

## ENV variables

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `FORECAST_JOB_ENABLED`
- `FORECAST_CRON` (legacy)
- `EDGE_THRESHOLD` (default 10)
- `MIN_PROB` (default 12)

## Как добавить новую модель

1. Реализуй `LLMAdapter` в `src/adapters/`
2. Добавь адаптер в `llmAdapters` массив
3. Убедись, что ответ соответствует контракту (probs/confidence/reasoningSummary)

## Как интерпретировать сигнал

- `bet` — если `edge >= EDGE_THRESHOLD` и `consensusProb >= MIN_PROB`
- `no_bet` — иначе

## Правило по рыночным данным (обязательно)

Для каждого AI-прогона в системе всегда храним и показываем **две отдельные строки рынка**:

1. **Рынок на момент запроса** (snapshot, зафиксированный в ту же минуту, когда отправлен запрос моделям)
2. **Рынок сейчас** (последний доступный current snapshot на момент просмотра дашборда)

Это правило обязательное для пайплайна, БД и UI: сравнение AI/edge должно опираться на обе строки одновременно.

## One-command start

```bash
./scripts/start.sh
```

## Docker

```bash
docker compose up --build
```

Приложение будет доступно на `http://localhost:3000`, а SQLite хранится в volume `sqlite_data`.
