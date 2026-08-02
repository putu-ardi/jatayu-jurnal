# ADR-0002: Tenant-scoped identity, access, and sessions

- Status: Accepted for P-10 foundation
- Date: 2026-07-21

## Context

E-JLS needs a defensible first access path before business capabilities are implemented. Google Workspace details are not yet configured, an administrator must be provisioned without a public registration path, and every privilege mutation must remain tenant-contained and auditable. Reverse proxy deployment must not weaken Next.js Server Action origin checks.

## Decision

### Authentication and bootstrap

- Qualify fallback login by normalized school code and email. Return one generic Indonesian failure for unknown school/user, bad password, suspended/deactivated user, disabled credential, and lockout.
- Run bcrypt verification against a cost-12 dummy hash when no real credential is available, limiting user-enumeration timing differences.
- Require 12–72-byte fallback passwords with lowercase, uppercase, number, and symbol. Five failed attempts lock a credential for 15 minutes.
- Provide no public registration/default password. A profile-gated, one-shot bootstrap requires explicit production acknowledgement, advisory locking, and a serializable transaction. It refuses to run after any assignment exists and never prints the password.
- After bootstrap, require the separate `iam.users.provision` capability and recent authentication for controlled manual provisioning. Derive the tenant from the principal, normalize email/username, create an `ACTIVE`/`MANUAL` user, and audit atomically. Do not create a password, role assignment, external identity, or session implicitly; those remain separate authorized workflows.
- Never reuse bootstrap, disposable browser seed, or direct SQL as operational user provisioning. Map unique identifier conflicts to a generic domain conflict.
- Keep Google Workspace visibly unconfigured; do not simulate SSO.

### Sessions

- Issue 32-byte opaque random tokens and store only their SHA-256 hash.
- Use an eight-hour fixed lifetime and an `HttpOnly`, `SameSite=Lax`, path-root cookie; enable `Secure` in production.
- Resolve the principal from database state on each protected request. Reject revoked/expired sessions and non-active users; evaluate assignment time/revocation for every authorization decision.
- Require authentication within 15 minutes for privilege-changing P-10 commands. Suspend/deactivate revokes active sessions.

### Authorization and mutation integrity

- Deny by default through one pure policy: active assignment + capability + tenant/scope containment. Grant/revoke additionally requires an explicit grantable-role boundary contained by both actor assignment and target scope.
- `SCHOOL` contains scopes in the same school. Other scope types require the exact type and reference; no implicit program/class hierarchy is assumed.
- Reject self-elevation, own lifecycle changes, and own fallback changes. Session self-revocation remains permitted to support account safety.
- Perform tenant-qualified target lookup and optimistic compare-and-swap writes. A stale version is a conflict, not a silent overwrite.
- Acquire row-level share locks, then reload and reauthorize the actor session, active-user state, assignments, capability, and grant boundary inside each serializable privilege transaction. Concurrent revocation/policy writes must serialize or abort. Treat request-time authorization only as fail-fast.
- Map serialization, deadlock, unique, and exclusion aborts to a generic domain conflict without exposing database detail.
- Treat UI action visibility as presentation only; Server Actions and data access remain authoritative.

### Audit and database defense

- Record actor and subject separately. Redact secret-like metadata keys centrally and keep audit rows append-only through a database trigger.
- Use PostgreSQL checks, unique indexes, and tenant-consistency triggers for identity, sessions, assignments, academic periods, branding, and audit references. Published branding is immutable.
- Enforce case-insensitive school-code identity and use a GiST exclusion constraint to reject overlapping unrevoked assignment ranges for the same tenant/user/role/scope, including school scope with a null reference.
- Increment failed fallback attempts in the database rather than from a stale application counter, so concurrent failures are retained. Lock and revalidate user/credential eligibility before a successful login emits any session, audit, or cookie; a lost compare-and-swap returns the generic failure.
- Preserve host authority through Nginx and rate-limit POST `/login`; do not disable Next.js origin validation.

## Consequences

- P-10 can operate with explicit fallback credentials before SSO is available, but operators must securely inject and remove bootstrap secrets.
- Logout/revocation takes effect on the next protected request because session state is database-backed.
- Capability and grant-boundary changes require reloading server data; optimistic conflicts require an operator refresh.
- Nginx's login limiter is per-IP and local to an instance. A multi-replica/trusted-proxy deployment needs deliberate real-IP and distributed rate-limit design.
- The current scope model intentionally has no hierarchy below school scope.
- The worker heartbeat proves the process loop, not continuous Redis readiness.
- The rollback-only PostgreSQL invariant script and concurrency regression tests are release-gate evidence to maintain as the schema evolves; applied migrations must only be corrected with forward migrations.
