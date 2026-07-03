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
npm run db:push    # створює таблиці за prisma/schema.prisma
npm run db:seed    # заповнює міста, продукти, рецепти, обладнання тощо
```

### 4. Запустити

```bash
npm run dev
```

Відкрити [http://localhost:3000](http://localhost:3000), зареєструвати акаунт
(стартовий баланс ₴500 000) і почати грати.

## Ігровий тік

Гра просувається "тіками" (1 тік = виробництво, зарплати, ринок, кредити тощо
за один прохід). У проді тік запускає зовнішній cron-сервіс (cron-job.org)
щогодини через `GET /api/cron/tick` з заголовком
`Authorization: Bearer <CRON_SECRET>` (Vercel Hobby не підтримує частіший
за добовий cron, тому зовнішній сервіс обов'язковий).

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
| `npm run db:push`      | Синхронізувати схему Prisma з БД без міграцій       |
| `npm run db:migrate`   | Створити/застосувати міграцію (`prisma migrate dev`)|
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

```bash
npm run test
```

## Деплой

Проєкт налаштований під Vercel (`vercel.json`). Потрібно:
1. Прив'язати той самий `DATABASE_URL` (Neon) у Vercel env vars
2. Додати `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (продакшн-домен), `CRON_SECRET`
3. Налаштувати зовнішній cron (напр. cron-job.org) на щогодинний
   `GET https://<домен>/api/cron/tick` із заголовком
   `Authorization: Bearer <CRON_SECRET>`
