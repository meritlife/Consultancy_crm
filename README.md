# Consultancy CRM

A full-stack multi-tenant SaaS CRM for **Passport & Visa consulting agencies**. Manage client applications, track payments, send WhatsApp reminders, and export reports — all in one place.

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js · Express.js |
| Database | SQLite (better-sqlite3) |
| Auth     | JWT (httpOnly cookies) |
| Frontend | Vanilla HTML · CSS · JavaScript |

---

## Pages

| URL          | Description |
|--------------|-------------|
| `/`          | Landing / marketing page |
| `/login`     | Login & register |
| `/dashboard` | Agency dashboard (owners & employees) |
| `/admin`     | Super-admin portal (all agencies) |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET` (min 64 characters).

### 3. Seed the database

```bash
node db/seed.js
```

### 4. Start the server

```bash
node server.js
# → http://localhost:3000
```

For development with auto-restart:

```bash
node --watch server.js
```

---

## Default Login Credentials

> Change all passwords immediately in production.

| Role          | Email                | Password    | Access        |
|---------------|----------------------|-------------|---------------|
| Super Admin   | admin@saas.com       | Admin@1234  | `/admin`      |
| Agency Owner  | alice@apex.com       | Alice@1234  | `/dashboard`  |
| Agency Owner  | bob@global.com       | Bob@1234    | `/dashboard`  |
| Employee      | asha@apex.com        | Asha@1234   | `/dashboard`  |
| Employee      | rahul@apex.com       | Rahul@1234  | `/dashboard`  |
| Employee      | meena@global.com     | Meena@1234  | `/dashboard`  |

---

## Features

### Client Management
- Full CRUD for client records (name, phone, DOB, service, status, notes)
- Advanced search and filtering (status, payment status, assigned employee)
- View-only mode → click Edit to enable editing
- Processing stage tracker (Documents Collected → Dispatched → Delivered)
- Service center / PSK / VFS center tracking
- Appointment date + time
- Travel date for visa clients

### Payments & Commission
- Track fees, amount received, and balance due
- Auto-compute payment status (Pending / Partial / Received)
- Service fee auto-fill by service type when adding new records
- Referral agent commission tracking (agent name, amount, paid status)

### WhatsApp Integration
- Birthday greeting — one click sends pre-drafted WhatsApp message
- Passport expiry reminder — 30-day and 60-day alerts with pre-drafted message
- Appointment reminder — includes date, time, center, and document checklist
- Payment due reminder — includes fee breakdown and balance due

### Dashboard Insights
- Today's birthdays panel
- Passport expiry reminders panel (30/60 days)
- Outstanding dues panel (sorted by amount owed)
- 7 summary metrics with quick-filter chips

### Bulk Operations
- CSV bulk upload with intelligent column mapping and row validation
- 15-row sample template download (realistic Indian client data)
- Export: **CSV**, **Excel (.xlsx)**, **PDF** with column picker (select exactly which fields to export)

### Team Management (Agency Owners)
- Add / remove employees with role assignment (Employee / Agency Co-Owner)
- Audit logs — every action tracked with timestamp, user, and details

### Super Admin
- Manage all agencies (create, suspend, delete)
- View global statistics across all agencies
- Global audit log

### UI/UX
- Light and dark theme
- Fully responsive (desktop, tablet, mobile card view)
- Real-time toast notifications

---

## Project Structure

```
├── server.js               # Express entry point
├── package.json
├── .env.example            # Environment template
├── db/
│   ├── index.js            # better-sqlite3 singleton + migrations
│   ├── schema.sql          # Table definitions
│   └── seed.js             # Demo data seeder
├── middleware/
│   ├── auth.js             # JWT cookie verification
│   └── role.js             # RBAC (requireSuperAdmin, requireOwnerOrAbove)
├── routes/
│   ├── auth.js             # /api/auth/*
│   ├── records.js          # /api/records/*
│   ├── agencies.js         # /api/agencies/*
│   ├── employees.js        # /api/employees/*
│   └── logs.js             # /api/logs/*
├── utils.js                # toCamel, computePaymentStatus, writeLog
└── public/
    ├── index.html          # Landing page
    ├── login.html          # Auth page
    ├── dashboard.html      # Agency dashboard
    ├── admin.html          # Super-admin portal
    ├── css/
    │   ├── shared.css      # Variables, buttons, modals, badges
    │   ├── landing.css
    │   ├── auth.css
    │   └── dashboard.css
    └── js/
        ├── api.js          # Fetch wrapper (window.API)
        ├── landing.js
        ├── auth.js
        ├── dashboard.js    # Main dashboard logic
        └── admin.js
```

---

## API Reference

### Auth
```
POST /api/auth/login      { email, password }
POST /api/auth/register   { name, email, password }
POST /api/auth/logout
GET  /api/auth/me
```

### Records
```
GET    /api/records                  ?search, status, paymentStatus, assignedTo
POST   /api/records                  Create record
PUT    /api/records/:id              Update record
DELETE /api/records/:id              Delete record
POST   /api/records/bulk             { records: [...] }
```

### Agencies (super-admin)
```
GET    /api/agencies
POST   /api/agencies                 { name, ownerName, ownerEmail, ownerPassword }
PUT    /api/agencies/:id/status      Toggle Active/Suspended
DELETE /api/agencies/:id
```

### Employees
```
GET    /api/employees
POST   /api/employees                { name, email, password, role }
DELETE /api/employees/:id
```

### Logs
```
GET    /api/logs                     ?action
DELETE /api/logs
```

---

## Environment Variables

| Variable        | Description                        | Required |
|-----------------|------------------------------------|----------|
| `PORT`          | Server port (default: 3000)        | No       |
| `JWT_SECRET`    | Secret key for JWT signing         | **Yes**  |
| `JWT_EXPIRES_IN`| Token expiry (default: 7d)         | No       |
| `DB_PATH`       | SQLite file path                   | No       |
| `NODE_ENV`      | `development` or `production`      | No       |

---

## License

MIT
