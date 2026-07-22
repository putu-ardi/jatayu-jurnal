# E-JLS workspace instructions

- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions
- [x] Compile the Project
- [x] Create and Run Task
- [x] Launch the Project
- [x] Ensure Documentation is Complete

## Execution guidelines

- Keep the parent-folder Fase 0 documents, design system, and prototype unchanged.
- Use Next.js App Router, TypeScript strict, Tailwind, PostgreSQL/Prisma, Redis/BullMQ, npm with a committed lockfile, and a `src/` layout.
- Treat the application as a Docker-first modular monolith with a separate worker.
- Keep PostgreSQL, Redis, web, worker, and metrics private; Nginx is the only public service.
- Use non-root, immutable, multi-stage container images and one-shot migrations.
- Keep liveness independent from external dependencies and readiness dependency-aware.
- Do not implement business features before the foundation gate is accepted.
