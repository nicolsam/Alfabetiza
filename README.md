<div align="center">

# Alfabetiza

**A full-stack literacy tracking platform that helps educators monitor reading development and identify students who need support.**

[![Live Application](https://img.shields.io/badge/Live%20Application-2563EB?style=for-the-badge&logo=vercel&logoColor=white)](https://alfabetiza-app.vercel.app/)
[![Developer Documentation](https://img.shields.io/badge/Developer%20Docs-111827?style=for-the-badge&logo=readthedocs&logoColor=white)](docs/README.md)

[English](README.md) · [Português do Brasil](README.pt-BR.md)

</div>

## Overview

Alfabetiza is an independent product created to solve a real problem reported by a teacher: keeping students' reading levels organized and understanding how their literacy skills change over time.

The application replaces fragmented manual records with a centralized workflow for schools, classes, students, monthly reading assessments, historical progress and follow-up actions. The product is currently in its early validation stage with one initial user and is being designed to support broader academic-management modules in the future.

The project is designed and developed independently by [Nicolas Samuel](https://github.com/nicolsam).

## Product Preview

### Reading progress dashboard

![Alfabetiza dashboard showing filters, reading-level indicators and charts](docs/images/dashboard-en.png)

The dashboard summarizes the distribution of reading levels, monthly updates and students who may need additional attention. Filters allow educators to narrow the analysis by school, grade, class, shift, month and academic year.

### System administration and auditability

![Alfabetiza system administration panel](docs/images/admin-panel-en.png)

Administrative tools provide session monitoring, platform-wide audit logs and high-level usage indicators. The screenshots only contain aggregate, non-identifying information.

## Core Features

- **Monthly literacy tracking** — Records reading levels over time instead of keeping only the latest assessment.
- **Progress dashboards** — Visualizes distributions, improvements, pending updates and students who need attention.
- **School-based access control** — Supports teachers, academic coordinators and administrators with role-specific permissions.
- **Student and enrollment management** — Organizes schools, classes, students, contacts and enrollment history.
- **Bulk student import** — Validates input, reuses existing records and performs database writes transactionally.
- **Parent report links** — Generates time-limited report links that can be shared without exposing the full platform.
- **Internationalization** — Provides complete Portuguese and English interfaces with `next-intl`.
- **Guided product tours** — Helps new users understand important workflows inside the application.
- **Audit trail and sessions** — Records mutating actions and gives administrators visibility into active sessions.
- **Server-side search and pagination** — Keeps management pages responsive as the number of records grows.

## Engineering Highlights

- Relational domain model with schools, users, school-level roles, classes, students, enrollments, assessment types, reading levels and monthly assessments.
- Role-based authorization enforced across protected application and API operations.
- Unique constraints, indexes, soft deletion and cascading relationships defined with Prisma.
- Transactional import workflow to avoid partial writes and reduce repeated database queries.
- Unit and component testing with Vitest and Testing Library.
- Cross-browser end-to-end testing with Playwright.
- Bilingual developer handbook covering architecture, database design, authentication, APIs, testing and operations.

## Architecture

```text
Browser
  └── Next.js App Router
      ├── React user interface
      ├── Route handlers and server-side operations
      ├── Authentication, authorization and audit services
      └── Prisma ORM
          └── PostgreSQL
```

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Next.js route handlers, Prisma ORM, Zod |
| Database | PostgreSQL, Supabase, Prisma migrations |
| Authentication | JWT, password hashing, revocable sessions, role-based access control |
| Internationalization | next-intl, English and Brazilian Portuguese |
| Testing | Vitest, Testing Library, Playwright |
| Product experience | TipTap, Driver.js, Sonner |

## Domain Model

The main relationships are organized around the school context:

```text
School
  ├── UserSchool ── User
  ├── Class
  │   └── Enrollment ── Student
  └── MonthlyAssessment
      ├── AssessmentType
      └── ReadingLevel
```

This structure allows a user to have different roles in different schools while preserving student enrollment and assessment history.

## Getting Started

### Prerequisites

- Node.js compatible with Next.js 16
- pnpm
- Docker and Docker Compose

### Local setup

```bash
git clone https://github.com/nicolsam/Alfabetiza.git
cd Alfabetiza
pnpm install
cp .env.example .env
docker compose up -d
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm dev
```

Open `http://localhost:3000`.

For environment variables, project conventions and operational details, see the [Getting Started guide](docs/en/01-getting-started.md).

## Tests

```bash
# Unit and component tests
pnpm test

# Coverage
pnpm run test:coverage

# End-to-end tests
pnpm run test:e2e
```

## Documentation

The complete developer handbook is maintained in both languages:

- [English documentation](docs/README.md#english)
- [Documentação em português](docs/README.md#português-do-brasil)

It covers project architecture, database design, authentication and sessions, API behavior, frontend conventions, internationalization, testing, development workflow, deployment and troubleshooting.

## Product Status and Roadmap

Alfabetiza is an early-stage independent product currently validating its core literacy-tracking workflow. Planned directions include:

- broader academic and school-management modules;
- richer historical and comparative reports;
- improved communication with parents and guardians;
- more import and export workflows;
- stronger operational monitoring and deployment automation.

## Author

Developed by **Nicolas Samuel**.

[GitHub](https://github.com/nicolsam) · [LinkedIn](https://www.linkedin.com/in/nicolas-samuel-veras/) · [Email](mailto:contato@nicolsam.com.br)
