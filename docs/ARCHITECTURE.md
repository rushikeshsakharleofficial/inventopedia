# Inventopedia Architecture

Inventopedia starts as a poultry farm inventory manager and later expands into a generic inventory workspace for small businesses.

## Runtime Components

- React/Vite frontend
- Go REST API
- PostgreSQL database
- Local uploads directory
- Docker Compose deployment
- Backup scripts

## Source of Truth

Inventory events are the source of truth.

Current stock is calculated from positive and negative events.

Positive events:

- opening_stock
- purchase
- transfer_in
- return

Negative events:

- death
- lost
- sold
- transfer_out
- damage

Correction events can be positive or negative.

## Initial Deployment

One VPS is enough for the first MVP.

Run frontend, backend, PostgreSQL, uploads, and backups together using Docker Compose.

## Later Scaling

- Split PostgreSQL to a separate server.
- Move uploads to S3-compatible storage.
- Add worker service for reports and exports.
- Add Redis only when caching/rate-limits require it.
- Add RabbitMQ only when background jobs become heavy.
