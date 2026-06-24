# XYZ HRMS — Enterprise MERN Human Resource Management System

A full-stack HRMS covering the complete employee lifecycle: authentication,
user directory, offer letters with native e-signatures, compensation modelling,
automated payslips, multi-stage onboarding, and a secure document vault.

- **Frontend** (`/client`) — React 19 + Vite, Tailwind CSS + Material UI (hybrid), AG Grid, Redux Toolkit, React Router v6
- **Backend** (`/server`) — Node.js, Express (REST, MVC), MongoDB + Mongoose, JWT (HTTP-only cookie), Multer, pdf-lib, ExcelJS

```
hrms/
├── client/            # React SPA (admin + HR + employee portals)
├── server/            # Express REST API + MongoDB models
├── CLAUDE.md          # Engineering playbook / conventions
├── epics_backlogs.md  # Product epics & user stories
├── mongoose_models.md # Canonical DB schema reference
├── brainstrom.md      # Raw flow notes (admin + employee)
├── WIREFRAMES_ADMIN.md / WIREFRAMES_EMPLOYEE.md
└── README.md          # ← you are here
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 18 | Uses built-in test runner & modern ESM |
| **npm** | ≥ 9 | Ships with Node |
| **MongoDB** | ≥ 6 | Local (`mongodb://127.0.0.1:27017`) or a connection string (Atlas, etc.) |

> Tests use an in-memory MongoDB (`mongodb-memory-server`) and need no running DB.

---

## Quick start

Open **two terminals** — one for the server, one for the client.

### 1. Backend (`/server`)

```bash
cd server
npm install
cp .env.example .env        # then set JWT_SECRET and MONGO_URI
npm run db:seed             # load demo data for every module (destructive)
npm run dev                 # http://localhost:5000
```

`npm run db:seed` prints login credentials and live candidate offer links. Defaults:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@xyz.com` | `Admin@123` |
| HR | `priya.hr@xyz.com` | `Password1` |
| Employee | `rahul.kumar@xyz.com` | `Password1` |

### 2. Frontend (`/client`)

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to the backend on port 5000,
so no extra CORS/env config is needed for local development. Open
**http://localhost:5173** and sign in with a seeded account.

---

## Common commands

| Location | Command | What it does |
|---|---|---|
| `server` | `npm run dev` | Start API with auto-reload (nodemon) |
| `server` | `npm start` | Start API (plain node) |
| `server` | `npm run db:seed` | Load full demo dataset (wipes HRMS collections) |
| `server` | `npm run db:seed:admin` | Seed only an admin account |
| `server` | `npm test` | Run API + unit tests (in-memory Mongo, serial) |
| `client` | `npm run dev` | Start the SPA dev server |
| `client` | `npm run build` | Production build to `client/dist` |
| `client` | `npm run preview` | Preview the production build |

---

## Environment variables (`server/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Secret used to sign JWTs |
| `MONGO_URI` | ✅ | `mongodb://127.0.0.1:27017/hrms` | MongoDB connection string |
| `PORT` |  | `5000` | API port |
| `NODE_ENV` |  | `development` | `development` / `production` / `test` |
| `CLIENT_ORIGIN` |  | `http://localhost:5173` | CORS origin + magic-link base URL |
| `JWT_EXPIRES_IN` |  | `1d` | Token lifetime |
| `COOKIE_NAME` |  | `hrms_token` | Auth cookie name |

See [`server/README.md`](server/README.md) for the full API reference and architecture notes.

---

## Portals at a glance

- **Admin / HR** — dashboard with live metrics, user directory (AG Grid + filters),
  offer letters (single + bulk XLSX, e-sign tracking), salary templates, payslip
  generation, and document verifications.
- **Candidate** (public magic link) — review offer + compensation breakdown,
  draw a signature to accept, then set up account credentials.
- **Employee** — self-service hub, multi-step onboarding wizard, document vault,
  and payslip history with PDF downloads.

## Notes

- Money is stored as **integer paisa** to avoid floating-point drift.
- Avatars are served statically; PAN/Aadhar documents, payslips and offer PDFs are
  streamed only through authorized routes (never by raw path).
- Email is a console/in-memory stub (`server/services/emailService.js`); in
  non-production, magic-link/setup tokens are returned in API responses for testing.
