# UAeconomy

Веб-симулятор української економіки. Гравці засновують підприємства (агроферми,
текстильні фабрики, роздрібні магазини, логістичні хаби тощо), наймають персонал,
виробляють і продають товари на ринку, беруть кредити, торгують акціями на біржі
й конкурують за місце в рейтингу.

## Стек

- **Next.js 16** (App Router, TypeScript) — фронтенд + API-роути в одному застосунку
- **Prisma 5** + **PostgreSQL** (Neon) — ORM і БД
- **NextAuth.js v5** (JWT-стратегія) — автентифікація
- **Tailwind CSS 4**
- **Vitest** — юніт-тести

Ігрова логіка (виробництво, ринок, кредити, тваринництво, біржа тощо) живе в
`src/engine/*Service.ts` — це ~35 незалежних сервісів, які щотіку викликає
`TickEngine.ts`. Тік запускається зовнішнім cron (раз на годину в проді) через
`GET /api/cron/tick`.

## Швидкий старт

### 1. Встановити залежності

```bash
npm install
```

### 2. Налаштувати БД

Потрібна PostgreSQL-база. Найпростіше — безкоштовний проєкт на
[neon.tech](https://neon.tech) (Vercel-сумісний, serverless Postgres).

```bash
cp .env.example .env
```

**Важливо: файл має називатись саме `.env`, не `.env.local`.** Next.js
читає обидва, але `npx prisma db push` / `npm run db:seed` (Prisma CLI,
`ts-node`) автоматично підхоплюють лише `.env` — з `.env.local` вони
впадуть з `Environment variable not found: DATABASE_URL`.

Заповніть у `.env`:

| Змінна            | Опис                                                                 |
|--------------------|-----------------------------------------------------------------------|
| `DATABASE_URL`     | Рядок підключення до Postgres                                       |
| `NEXTAUTH_SECRET`  | Довільний секрет для шифрування сесій — `openssl rand -base64 32`    |
| `NEXTAUTH_URL`     | `http://localhost:3000` для локальної розробки                     |
| `CRON_SECRET`      | Захищає `/api/cron/tick` від сторонніх викликів — `openssl rand -hex 32` |
| `TICK_INTERVAL_MS` | Інтервал ігрового тіку для локального `npm run engine:tick` (мс)     |

**Без `NEXTAUTH_SECRET` застосунок стартує, але автентифікація впаде з
помилкою `MissingSecret` — це очікувано, просто заповніть змінну.**

### 3. Застосувати схему і засіяти базу початковими даними

```bash
npm run db:migrate:deploy   # застосовує міграції з prisma/migrations/
npm run db:seed             # заповнює міста, продукти, рецепти, обладнання тощо
```

Схема БД тепер відстежується через Prisma-міграції (`prisma/migrations/`), а не
`db push`. Для змін схеми під час розробки:

```bash
npm run db:migrate   # створює + застосовує нову міграцію (інтерактивно, локально)
```

`npm run db:push` лишається доступним для швидкого прототипування без
створення міграції — але перед комітом зміну треба оформити як міграцію
через `db:migrate`, інакше БД і `prisma/migrations/` розійдуться.

### 4. Запустити

```bash
npm run dev
```

Відкрити [http://localhost:3000](http://localhost:3000), зареєструвати акаунт
(стартовий баланс ₴500 000) і почати грати.

## Ігровий тік

Гра просувається "тіками" (1 тік = виробництво, зарплати, ринок, кредити тощо
за один прохід). У проді тік щогодини викликає GitHub Actions workflow
(`.github/workflows/tick.yml`) через `GET /api/cron/tick` з заголовком
`Authorization: Bearer <CRON_SECRET>` (Vercel Hobby не підтримує частіший
за добовий cron, тому `vercel.json` має лише резервний щоденний виклик).

Для локальної розробки є два способи прогнати тік вручну:

```bash
npm run engine:tick   # демон: тікає з інтервалом TICK_INTERVAL_MS у циклі
```

або одноразовий виклик через `POST /api/admin/tick` (потребує будь-якої
залогиненої сесії — ендпоінт не перевіряє роль адміністратора).

## Скрипти

| Команда              | Що робить                                          |
|-----------------------|-----------------------------------------------------|
| `npm run dev`          | Локальний dev-сервер (Turbopack)                   |
| `npm run build`        | Продакшн-збірка (`prisma generate` + `next build`)  |
| `npm run start`        | Запуск продакшн-збірки                             |
| `npm run lint`         | ESLint                                             |
| `npm run test`         | Vitest (один прогін)                               |
| `npm run test:watch`   | Vitest у watch-режимі                              |
| `npm run db:push`      | Швидке прототипування схеми без міграції (тільки dev)|
| `npm run db:migrate`   | Створити/застосувати нову міграцію (`prisma migrate dev`)|
| `npm run db:migrate:deploy` | Застосувати всі існуючі міграції (прод/CI, non-interactive) |
| `npm run db:seed`      | Засіяти базу початковими даними                    |
| `npm run db:studio`    | Prisma Studio — переглянути/редагувати дані вручну  |
| `npm run engine:tick`  | Локальний демон ігрового тіку                      |

## Структура проєкту

```
src/
  app/
    (auth)/          # /login, /register
    (game)/          # усі ігрові сторінки (дашборд, підприємства, ринок...)
    api/              # ~55 груп API-роутів (по одній на кожну функцію гри)
  engine/             # ігрова логіка: TickEngine + ~35 *Service.ts
  components/         # React-компоненти (game/, layout/, ui/)
  lib/                # auth, prisma-клієнт, утиліти
prisma/
  schema.prisma       # повна схема БД (77+ моделей)
  seed.ts             # початкові дані (міста, продукти, рецепти...)
scripts/              # одноразові адмін/дата-скрипти, не частина регулярного workflow
```

## Тести

Юніт-тести (Vitest) покривають чисту логіку, витягнуту з ігрових сервісів —
не 100% застосунку, а найкритичніші розрахунки:

- `TickEngine` — захист від паралельного запуску двох тіків одночасно
- `LoanService` / `FinanceService` — кредитні ставки, ануїтетні платежі
- `EquipmentService` / `HRService` / `CapacityService` — виробничі формули
- `StockExchangeService` — корекція ціни акцій
- `AgroService` — оренда додаткового поля, штраф за розірвання ф'ючерсу
- `MarketService.matchOrders` / `ProductionService` — через `vitest-mock-extended`
  (мок `PrismaClient`): B2B-матчинг ордерів (ціна/якість/ліквідність/само-трейдинг),
  цикл виробництва (споживання input, розрахунок якості, capacity-гейти)

```bash
npm run test
```

## Деплой

Проєкт налаштований під Vercel (`vercel.json`). Потрібно:
1. Прив'язати той самий `DATABASE_URL` (Neon) у Vercel env vars
2. Додати `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (продакшн-домен), `CRON_SECRET`
3. Щогодинний тік викликає `.github/workflows/tick.yml` (GitHub Actions) —
   `GET https://<домен>/api/cron/tick` із заголовком
   `Authorization: Bearer <CRON_SECRET>`. `vercel.json` містить власний
   резервний cron (раз на добу — ліміт Vercel Hobby), на випадок якщо
   GitHub Actions недоступний.
4. `vercel.json`'s `buildCommand` автоматично прогонить `prisma migrate deploy`
   перед кожним білдом — нові міграції з `prisma/migrations/` застосовуються
   самі, вручну нічого запускати не треба.

`GET /api/health` — легкий, без авторизації, ендпоінт для uptime-моніторингу
(UptimeRobot, Better Uptime тощо): перевіряє з'єднання з БД (таймаут 3с),
повертає `{status: "ok"|"degraded", db: "up"|"down"}`.

## CI

`.github/workflows/ci.yml` на кожен push/PR у `main`/`Test3` прогонятиме
`lint` → `test` → `build`. Це не пускає у гілку код, який не білдиться.

## Моніторинг помилок (опційно)

Проєкт підключений до Sentry (`@sentry/nextjs`), але вимкнений за
замовчуванням — без `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` в env vars SDK
просто не ініціалізується і нічого нікуди не відправляє. Щоб увімкнути:
1. Зареєструватись на [sentry.io](https://sentry.io) (безкоштовний тариф)
2. Створити Next.js-проєкт, скопіювати DSN
3. Додати `SENTRY_DSN` і `NEXT_PUBLIC_SENTRY_DSN` (те саме значення) у
   Vercel env vars
4. Опційно — `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` для
   завантаження source maps (читабельні стек-трейси в проді)

## Rate-limiting (опційно, рекомендовано для проду)

`src/lib/rateLimit.ts` захищає чутливі ендпоінти (видача кредиту, M&A-угоди)
від спаму. Без налаштувань працює як in-memory лічильник у межах одного
"теплого" serverless-інстансу — краще, ніж нічого, але не переживає холодний
старт і не ділиться станом між інстансами. Для надійного захисту на масштабі:
1. Зареєструватись на [upstash.com](https://upstash.com) (безкоштовний тариф),
   створити Redis-базу
2. Скопіювати `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (REST API
   секція) у Vercel env vars — код автоматично перемкнеться на Redis
