# Google Scraper REST API (NestJS Backend)

Production-grade NestJS REST API with Server-Sent Events (SSE) and collector engine using Google Maps Platform Places API (New).

## Architecture
- **Framework:** NestJS 10 (TypeScript)
- **Database:** PostgreSQL with Prisma ORM
- **Queue/Workers:** BullMQ with Redis
- **Real-Time:** Server-Sent Events (SSE)
- **Documentation:** Swagger OpenAPI (`/api/docs`)

## Setup & Running
```bash
npm install
npm run start:dev
```

The API can start without PostgreSQL when `DATABASE_URL` is unset or
`DATABASE_DISABLED=true`. In this mode, endpoints that read or write database
data (including authentication, jobs, businesses, dashboard, exports, and
usage) are unavailable. Configure `DATABASE_URL` and run `npx prisma generate`
and `npx prisma db push` to use those features.

## Production Build & Run
```bash
npm run build
npm run start
```
