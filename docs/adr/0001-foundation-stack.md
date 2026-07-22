# ADR-0001: Docker-first modular monolith foundation

- Status: Superseded in part by ADR-0002
- Date: 2026-07-21

## Context

E-JLS requires a production foundation that preserves the validated Fase 0 product and UX artifacts while avoiding premature business implementation.

## Decision

- Use Next.js 16 App Router, React 19, TypeScript strict, and Tailwind CSS 4 in a `src/` layout.
- Use PostgreSQL 17 through Prisma 7 and its PostgreSQL driver adapter.
- Run asynchronous work in a separate BullMQ worker backed by Redis 8.
- Package web, worker, and one-shot migration targets as non-root multi-stage images.
- Publish only Nginx. Keep web, worker, PostgreSQL, and Redis on private Docker networks without host port bindings.
- Separate liveness from dependency-aware readiness.
- Keep the initial Prisma migration empty; domain tables are introduced only after the foundation gate passes.

## Consequences

At the time of this decision, the first release was operationally testable but intentionally had no authentication or business workflows. That statement is historical: the later forward migration and ADR-0002 introduce the approved P-10 Identity & Access foundation, while journal, attendance, analytics, and other workflows remain absent. The original empty migration is preserved rather than rewritten.
