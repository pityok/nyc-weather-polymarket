# Release Checklist

## 1. Pre-release

```bash
# 1. Pull latest main
git pull origin main

# 2. Build passes
npm run build

# 3. All tests green (ignore pre-existing flaky DB isolation tests)
npm run test:run

# 4. Check environment
cp .env.example .env   # if first deploy
cat .env               # verify: DATABASE_URL, OPENROUTER_API_KEY, PORT, etc.
```

---

## 2. Smoke Suite

Run after deploy to verify critical endpoints. Replace `BASE` with your server URL.

```bash
BASE=http://localhost:3000

# Health
curl -sf $BASE/health | jq .
# expected: {"ok":true}

curl -sf $BASE/health/metrics | jq .db
# expected: {"ok":true,"error":null}

# Summary for today
DATE=$(date +%Y-%m-%d)
curl -sf "$BASE/api/summary?date=$DATE" | jq '{date,forecastCount:.forecasts|length}'

# Evolution
curl -sf "$BASE/api/evolution?date=$DATE" | jq '{date,versions:.versions|length}'

# Model quality scoreboard
curl -sf "$BASE/api/model-quality?windowDays=7" | jq '{windowDays,models:.models|length}'

# Cities registry
curl -sf "$BASE/api/cities" | jq .cities

# Signals
curl -sf "$BASE/api/signals?date=$DATE" | jq '{date,signals:.items|length}'

# Market snapshot
curl -sf "$BASE/api/market?date=$DATE&type=current" | jq '{date,type,snapshots:.items|length}'

# Dashboard HTML loads
curl -sf -o /dev/null -w "%{http_code}" $BASE/dashboard.html
# expected: 200
```

All commands must return HTTP 200 and valid JSON. Any non-200 or parse error = **STOP, do not continue**.

---

## 3. Post-deploy Verification

```bash
# Check logs for degradation warnings
journalctl -u nyc-weather-polymarket -n 50 | grep -E "degraded|failed|WARN|ERROR"

# Verify cron is firing (should see pipeline logs every 30 min)
journalctl -u nyc-weather-polymarket -f

# Check error rates
curl -sf $BASE/health/metrics | jq '.services | to_entries[] | {service:.key, errorRate:.value.errorRate}'
# All errorRate should be < 0.1 in steady state
```

---

## 4. Rollback Plan

### Option A: Git revert (preferred)

```bash
# Find the last known-good commit
git log --oneline -10

# Revert to previous commit (creates a new revert commit)
git revert HEAD --no-edit
git push origin main

# Redeploy
pm2 restart nyc-weather-polymarket   # or systemctl restart / docker restart
```

### Option B: Hard reset (if revert too complex)

```bash
GOOD_COMMIT=<commit-hash>
git reset --hard $GOOD_COMMIT
git push --force origin main   # WARNING: destructive, coordinate with team

# Redeploy
pm2 restart nyc-weather-polymarket
```

### Option C: Docker rollback

```bash
# List recent images
docker images nyc-weather-polymarket

# Roll back to previous tag
docker stop nyc-weather-polymarket
docker run -d --name nyc-weather-polymarket \
  --env-file .env \
  -p 3000:3000 \
  nyc-weather-polymarket:<previous-tag>
```

---

## 5. Database Backup & Restore

The database is SQLite (single file). Default path: `./dev.db` (overridable via `DATABASE_URL`).

### Backup

```bash
# One-shot backup (safe even while app is running via SQLite WAL mode)
DB_PATH=${DATABASE_URL#file:}
DB_PATH=${DB_PATH:-./dev.db}
BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).db"

sqlite3 "$DB_PATH" ".backup $BACKUP_FILE"
echo "Backed up to $BACKUP_FILE"

# Or simply copy (stop app first for consistency if not using WAL):
cp "$DB_PATH" "$BACKUP_FILE"
```

### Automated backup (cron example)

```cron
# Daily at 03:00, keep 7 days
0 3 * * * cd /app && sqlite3 dev.db ".backup backups/daily-$(date +\%Y\%m\%d).db" && find backups/ -name "daily-*.db" -mtime +7 -delete
```

### Restore

```bash
# Stop the app
pm2 stop nyc-weather-polymarket

# Restore from backup
cp backup-20260310-030000.db dev.db

# Regenerate Prisma client (in case schema changed)
npm run db:generate

# Start the app
pm2 start nyc-weather-polymarket

# Verify
curl -sf http://localhost:3000/health
```

### Prisma migrate on first deploy / after schema change

```bash
npm run db:push      # development (no migration files)
npm run db:migrate   # production (generates migration SQL)
npm run db:generate  # always run after schema change
```

---

## 6. Monitoring Reference

| Signal | How to detect | Action |
|--------|--------------|--------|
| Market degraded | `GET /health/metrics` → `polymarket.errorRate > 0` | Check `POLYMARKET_USE_REAL`, `POLYMARKET_MARKET_IDS` |
| Open-Meteo degraded | `open-meteo.errorRate > 0` | Network issue; retries will recover |
| OpenRouter errors | `openrouter.errorRate > 0.3` | Check `OPENROUTER_API_KEY`, quota |
| All bets = no_bet | `GET /api/signals?date=...` | Market degraded or quality gate |
| No pipeline runs | No rows in `/api/runs?date=...` | Check `FORECAST_JOB_ENABLED`, cron |
| DB error | `GET /health/metrics` → `db.ok: false` | Check `DATABASE_URL`, disk space |

---

## 7. Environment Checklist

Before any deploy:

- [ ] `DATABASE_URL` points to correct SQLite file
- [ ] `OPENROUTER_API_KEY` set (if `BASELINE_ONLY=false`)
- [ ] `POLYMARKET_USE_REAL` set correctly (`false` = safe default)
- [ ] `POLYMARKET_MARKET_IDS` configured for upcoming dates (if `USE_REAL=true`)
- [ ] `FORECAST_CRON` matches desired schedule
- [ ] `EDGE_THRESHOLD` and `MIN_PROB` reviewed
- [ ] `QUALITY_GATE_REQUIRED` decision made (default: `false`)
- [ ] DB backup taken before deploy
- [ ] Smoke suite passed after deploy

---

## 8. City-specific smoke (example: Ankara)

Проверка API и dashboard для города Ankara (`cityId=ankara`). Подставьте актуальную дату и базовый URL.

```bash
BASE="http://localhost:3000"
DATE="2026-03-15"

curl -s "${BASE}/api/summary?date=${DATE}&cityId=ankara" | jq .
curl -s "${BASE}/api/evolution?date=${DATE}&cityId=ankara" | jq .
curl -s "${BASE}/api/signals?date=${DATE}&cityId=ankara" | jq .
curl -s "${BASE}/dashboard/snapshot?cityId=ankara" | jq .
```

**При отсутствии market IDs для даты/города:** ответ должен содержать **status: `degraded`**, **recommendation: `no_bet`**, в **reason** — явная причина. Mock/fake рыночные данные не допускаются.
