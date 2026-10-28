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
npx prisma generate
npx prisma db push
npm run start:dev
```

## Production Build & Run
```bash
npm run build
node dist/main.js
```
