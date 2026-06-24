# Inventopedia

**Inventopedia** is an open-source, self-hosted inventory workspace for poultry farms and small businesses.

It starts as a poultry-farm inventory manager for tracking batches, live birds, deaths, lost birds, feed, medicine, sales, bills, images, documents, reports, and audit history.

Long-term direction:

- **Self-hosted open-source edition** for users who want to run Inventopedia on their own VPS.
- **Cloud-hosted edition** for users who want managed hosting, backups, updates, and support.

First real-world use case: **Srimat Poultry Farm**.

---

## Why Inventopedia?

Many small farms and local businesses still manage inventory through notebooks, WhatsApp messages, Excel sheets, and scattered bill photos.

Inventopedia aims to provide one clean workspace for:

- Daily farm entries
- Current stock visibility
- Batch-wise mortality tracking
- Feed and medicine tracking
- Sales and payment status
- Bills and proof images
- Exportable reports
- Staff accountability
- Self-hosted control

---

## Current Status

Inventopedia is in early development.

The first build target is a robust poultry-farm MVP. After it becomes stable for real farm usage, the same foundation will expand into a generic inventory manager for other small businesses.

---

## Product Principles

1. **Self-hosted first**
   Users should be able to run Inventopedia on a normal VPS with Docker Compose.

2. **Cloud-ready later**
   The architecture should support a managed cloud version without changing the core product.

3. **Inventory ledger, not blind stock numbers**
   Stock changes must be auditable and traceable.

4. **Mobile-first daily entry**
   Farm workers should be able to enter daily data quickly from a phone.

5. **Beautiful but practical UI**
   The interface should feel like a modern workspace product, not a generic admin template.

6. **PostgreSQL-first**
   Reports, filters, exports, and audit history fit naturally in PostgreSQL.

---

## Core Architecture Rule

Inventopedia uses an **inventory event ledger** as the source of truth.

Do not only store current stock.

Every stock movement must be stored as an event:

- `opening_stock`
- `purchase`
- `death`
- `lost`
- `sold`
- `transfer_in`
- `transfer_out`
- `correction`
- `damage`
- `return`

Current live bird count is calculated from event history.

A cached balance can be added later for speed, but the event ledger remains the source of truth.

---

## MVP Scope

### Poultry Farm Modules

- Authentication and roles
- Business profile
- Farm management
- Shed management
- Poultry batch management
- Inventory event ledger
- Daily farm entry
- Death and lost count tracking
- Sales tracking
- Feed stock
- Medicine and vaccine stock
- File and image uploads
- Dashboard
- Reports
- CSV export
- Audit logs
- Backup and restore

### Roles

- **Owner**: full access
- **Manager**: operational access
- **Worker**: daily entry and limited views
- **Viewer**: read-only access

---

## Frontend Direction

Inventopedia should look like a premium editorial SaaS workspace.

Design goals:

- Clean and professional
- Mobile-first
- Beautiful enough for demos
- Calm dashboard experience
- Strong data visibility
- Notion-inspired spacing and card style, but original branding

Visual direction:

- Deep navy hero/dashboard band
- Purple primary CTA
- Warm white canvas
- Soft gray surfaces
- Pastel feature cards
- Thin borders
- 12px rounded cards
- 8px rounded buttons
- Clean database-table visual language
- Product mockup cards
- Simple farm-specific illustrations

---

## Tech Stack

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Local reusable components
- Lucide React icons

### Backend

- Go REST API
- PostgreSQL
- SQL migrations
- Secure authentication
- Role-based access control
- Audit logging

### Storage

- Local uploads first
- S3-compatible object storage later
- Store file metadata in PostgreSQL
- Store actual files outside PostgreSQL

### Deployment

- Docker Compose
- VPS/self-hosted first
- Caddy or Nginx reverse proxy
- Daily backups
- Restore testing

---

## Planned Repository Structure

```text
.
├── backend/
├── frontend/
├── database/
│   └── migrations/
├── deploy/
├── docs/
├── scripts/
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Local Development

After the first scaffold is added:

```bash
cp .env.example .env
docker compose up --build
```

Expected local URLs:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8080/health`
- Backend ready: `http://localhost:8080/ready`
- PostgreSQL: `localhost:5432`

---

## Production Direction

Start simple:

- One VPS
- Docker Compose
- PostgreSQL
- Go backend
- React frontend
- Local uploads
- Daily backups

Scale later:

- Separate app and database servers
- Object storage for uploads
- Worker server
- Redis only when needed
- RabbitMQ only when background jobs become heavy
- Load balancer after real traffic

---

## What Will Not Be Added Initially

Inventopedia will not add these in the first MVP:

- Redis
- RabbitMQ
- Kubernetes
- Public SaaS signup
- Payment gateway
- WhatsApp API
- Native mobile app
- GST invoice system
- Barcode scanner
- AI features
- Complex accounting
- Offline sync

These may come later after the core farm workflow is stable.

---

## Roadmap

### Phase 1: Foundation

- Repository scaffold
- Docker Compose
- PostgreSQL schema
- Go API health checks
- React frontend shell

### Phase 2: Core Farm Workflow

- Auth and roles
- Farm/shed/batch CRUD
- Opening stock event
- Daily death/lost entry
- Current stock calculation

### Phase 3: Operations

- Sales
- Feed inventory
- Medicine/vaccine inventory
- File uploads
- Dashboard

### Phase 4: Reporting

- Batch reports
- Mortality reports
- Sales reports
- Feed/medicine reports
- CSV export

### Phase 5: Production Hardening

- HTTPS
- Firewall
- Backups
- Restore testing
- Audit logs
- Security review

### Phase 6: Open-Source Release

- License finalization
- Contribution guide
- Self-hosting docs
- Demo data
- Screenshots
- Release notes

---

## Open-Source and Cloud Model

Inventopedia is planned as an open-source self-hosted product with a future managed cloud version.

Possible editions:

### Self-Hosted Community Edition

For users who want to run Inventopedia on their own server.

### Managed Cloud Edition

For users who want hosting, backups, monitoring, updates, and support handled for them.

### Dedicated Deployment

For larger farms or businesses that want isolated infrastructure.

---

## License

License is not finalized yet.

Because Inventopedia may have both a self-hosted open-source edition and a managed cloud edition, the license should be selected carefully before the first public release.

Possible options:

- AGPL-3.0 for strong open-source network-use protection.
- Apache-2.0 for permissive adoption.
- Business Source License for source-available commercial control.

Do not treat this repository as production-licensed until a final `LICENSE` file is added.

---

## Contributing

The project is not yet ready for external contributions.

Planned contribution docs:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `docs/self-hosting.md`
- `docs/development.md`

---

## Development Priority

Current priority order:

1. Bootstrap full-stack scaffold.
2. Build premium frontend UI.
3. Implement authentication.
4. Implement farm, shed, and batch CRUD.
5. Implement inventory event ledger.
6. Implement daily farm entry.
7. Implement dashboard and reports.
8. Add file upload.
9. Add backups and deployment docs.
10. Use the app daily at Srimat Poultry Farm.

---

## Repository

GitHub: https://github.com/rushikeshsakharleofficial/inventopedia
