# nyc-weather-polymarket

Production API: NYC Weather × Polymarket — прогнозирование максимальной температуры и поиск mispricing на рынке предсказаний.

Стек: Node.js 18+, TypeScript, Express, SQLite (Prisma), Zod, node-cron, Vitest.

---

## Архитектура

```
Cron (forecastIngestion)
  └── gatherForecastPayload(horizon, now)
        ├── targetDateForHorizon(horizon, now)   # NY timezone — источник истины
        ├── Open-Meteo baseline (с retry/backoff)
        ├── LLM adapters via OpenRouter (с retry/backoff)
        ├── computeModelWeights7d()              # 7d quality weights (P1/P3)
        ├── weightedDistribution()               # реальный weighted consensus
        ├── getMarketProbabilities()             # ID-first Polymarket lookup (P1)
        └── edgeSignals: degraded => no_bet      # рисковые гейты

API (Express)
  ├── /api/summary?date=        → сводка по дате
  ├── /api/evolution?date=      → эволюция прогноза (P2)
  ├── /api/model-quality        → качество моделей (P3)
  ├── /api/cities               → реестр городов (P4)
  ├── /api/signals, /api/market, /api/runs, /api/backtest
  └── /dashboard/snapshot       → актуальный снапшот

Dashboard
  ├── /dashboard.html           → основной дашборд
  └── /dashboard-by-time.html   → по времени
```

---

## Установка

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push       # создаёт SQLite схему
npm run dev           # запуск в режиме разработки
```

---

## Конфигурация (.env)

| Переменная | Default | Описание |
|-----------|---------|----------|
| `PORT` | `3000` | HTTP порт |
| `DATABASE_URL` | `file:./dev.db` | SQLite путь |
| `FORECAST_CRON` | `*/30 * * * *` | Расписание прогнозов |
| `FORECAST_JOB_ENABLED` | `true` | Включить cron |
| `BASELINE_ONLY` | `true` | Только Open-Meteo (без LLM) |
| `OPENROUTER_API_KEY` | — | API ключ OpenRouter |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL |
| `POLYMARKET_USE_REAL` | `false` | Включить реальный Polymarket |
| `POLYMARKET_MARKET_IDS` | `{}` | JSON реестр market IDs по датам |
| `EDGE_THRESHOLD` | `10` | Минимальный edge для bet (%) |
| `MIN_PROB` | `12` | Минимальная AI prob для bet (%) |
| `QUALITY_GATE_REQUIRED` | `false` | P3: требовать 7d качество для bet |
| `DEFAULT_CITY_ID` | `nyc` | Город по умолчанию |

---

## Polymarket: ID-first market mapping

Система НЕ использует substring matching. Маркет привязывается по стабильному ID.

Настройка через `POLYMARKET_MARKET_IDS` (JSON). Ключ: **`YYYY-MM-DD:cityId`** (дата и город). Значение: `conditionId` или `slug`.

```json
{
  "2026-03-15:nyc": "0xabc...",
  "2026-03-16:nyc": "0xdef...",
  "2026-03-15:london": "0x...",
  "2026-03-15:ankara": "0x...",
  "2026-03-16:ankara": "0x..."
}
```

Если дата (и город) не зарегистрированы → `status: degraded`, `recommendation: no_bet`. Никаких mock-значений.

---

## Добавить новый город

1. Добавить запись в `src/config/cities.ts`:
```typescript
london: {
  cityId: "london",
  displayName: "London Heathrow",
  coords: { lat: 51.477, lon: -0.461 },
  timezone: "Europe/London",
}
```

2. Настроить `POLYMARKET_MARKET_IDS` с market IDs для нового города.

3. Написать smoke test в `src/config/cities.test.ts`.

4. API автоматически поддержит `?cityId=london`.

---

## Деградации / статусы

| Статус | Значение | Действие |
|--------|----------|----------|
| `healthy` | Всё OK | Bet по порогам |
| `degraded` | Частичная работа | `no_bet`, причина в reason |
| `failed` | Полный отказ | `no_bet`, причина в reason |

Причины деградации market:
- `POLYMARKET_USE_REAL=false` — рынок выключен конфигом
- `no_market_id_registered_for_date:YYYY-MM-DD` — нет ID для даты
- `no_outcomes_in_registered_market` — рынок пустой
- `Timeout after Nms (after N attempts)` — сеть упала (retry исчерпан)

---

## Интерпретация bet / no_bet

**bet** — сигнал к ставке:
- `edge >= EDGE_THRESHOLD` (по умолчанию 10%)
- `aiProb >= MIN_PROB` (по умолчанию 12%)
- market status = `healthy`
- quality gate passed (если `QUALITY_GATE_REQUIRED=true`)

**no_bet** — нет ставки. Причина всегда в поле `reason`.

---

## API эндпоинты

### `GET /api/evolution?date=YYYY-MM-DD`
Эволюция прогноза по targetDate: версии T-2 → T-1 → T0 с дельтами.
```json
{
  "date": "2026-03-10",
  "versions": [
    { "versionIndex": 0, "requestDatetimeMsk": "2026-03-08 09:00", "horizon": "day2", "topRange": "r_44_45", "probs": {...} }
  ],
  "deltas": [
    { "topRangeChanged": true, "topRangePrev": "r_42_43", "topRangeCur": "r_44_45", "probDelta": {...} }
  ]
}
```

### `GET /api/model-quality?windowDays=7`
Качество моделей за N дней.
```json
{
  "windowDays": 7,
  "models": [
    { "modelId": "...", "weekStartDate": "2026-03-04", "weight": 65.2, "metrics": { "hitRate": 0.6, "brierScore": 0.18, "calibrationError": 0.12, "n": 5 } }
  ]
}
```

### `GET /api/cities`
Реестр городов.

### `GET /api/backtest?from=YYYY-MM-DD&to=YYYY-MM-DD`
Теперь возвращает `modelSummary` — качество по каждой модели за период.

---

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Разработка (tsx watch) |
| `npm run build` | Сборка TypeScript |
| `npm run start` | Запуск из `dist/` |
| `npm run test:run` | Тесты один раз |
| `npm run lint` | ESLint |
| `npm run db:generate` | Генерация Prisma Client |
| `npm run db:push` | Синхронизация схемы |
| `npm run db:migrate` | Миграция (dev) |

---

## Мониторинг / алерты

- `GET /health` → `{ ok: true }` — базовый healthcheck
- `GET /health/metrics` → in-memory метрики по каждому внешнему сервису:
  ```json
  {
    "ok": true,
    "db": { "ok": true },
    "services": {
      "open-meteo":  { "callCount": 48, "errorCount": 0, "retryCount": 2, "avgLatencyMs": 312, "errorRate": 0 },
      "polymarket":  { "callCount": 48, "errorCount": 1, "retryCount": 0, "avgLatencyMs": 890, "errorRate": 0.0208 },
      "openrouter":  { "callCount": 96, "errorCount": 0, "retryCount": 1, "avgLatencyMs": 4210, "errorRate": 0 }
    }
  }
  ```
- Логи: `[pipeline] weighted consensus fallback: reason=...` — нет качественных данных
- Логи: `[fetchWithRetry] attempt N failed` — retry с причиной

**Алерт на деградацию market:** `polymarket.errorRate > 0` или `no_bet` во всех сигналах.
**Алерт на пустой market:** `/api/market?date=...` пустой более 2 cron-циклов.

→ Полный release checklist, smoke suite, rollback plan, DB backup: **[RELEASE.md](./RELEASE.md)**

---

## Onboarding Ankara

Город **Ankara** уже в реестре городов (multi-city).

- **cityId:** `ankara`
- **Timezone:** `Europe/Istanbul`
- **Market slug prefix:** для температурного рынка Анкары — `marketResolverConfig.defaultSlugPrefix` (например `highest-temperature-in-ankara`).

Маппинг рынков по городу и дате: ключ в формате **`YYYY-MM-DD:cityId`** (пример для Ankara: `2026-03-15:ankara`). Пример `POLYMARKET_MARKET_IDS` с NYC, London и Ankara см. в [.env.example](./.env.example).

**Контракт при отсутствии market ID:** если для пары дата+cityId запись в `POLYMARKET_MARKET_IDS` отсутствует → **status:** `degraded`, **recommendation:** `no_bet`, в **reason** — явная причина. Никаких mock/fake рыночных данных.

---

## Time domain
