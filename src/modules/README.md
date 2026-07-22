# Module boundaries

Business capabilities live under this directory after their release gates are accepted.

The modular-monolith boundaries are:

- `identity-access` — active: tenant-qualified authentication, opaque sessions, policy, P-10 reads/mutations, first-admin bootstrap, and role/capability catalog.
- `audit` — active: append-only audit writes and metadata redaction.
- `master-data` — planned.
- `schedule` — planned.
- `attendance` — planned; morning attendance and lesson attendance remain separate concepts.
- `journal` — planned.
- `analytics` — planned; no prestige ranking.
- `academic-rollover` — planned; historical records must not be rewritten.

Modules may share infrastructure from `src/lib`, but they must not reach across another module's internal application services. Cross-module work must go through explicit exported commands, queries, or events. Database relations and constraints may enforce tenant integrity across owned records, but they do not authorize requests.

`identity-access` owns `User`, `ExternalIdentity`, `FallbackCredential`, `Role`, `Permission`, `RoleAssignment`, grant boundaries, and `Session`. It invokes the exported audit service for privileged events. Authorization stays deny-by-default in the central pure policy and must be repeated by every command/query; hiding UI controls is not authorization.

The worker in `src/worker` consumes BullMQ jobs and delegates domain work back to exported module application services. It must not become a second business layer.

The active P-10 implementation does not authorize development of the planned business capabilities, and Google Workspace login remains unconfigured.
