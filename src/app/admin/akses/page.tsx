import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock3,
  Fingerprint,
  History,
  IdCard,
  KeyRound,
  Laptop,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  UserCheck,
  UserPlus,
  UsersRound,
  XCircle,
} from "lucide-react";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} from "@/modules/identity-access/errors";
import {
  getCurrentPrincipal,
  hasRecentAuthentication as hasRecentPrincipalAuthentication,
} from "@/modules/identity-access/session-dal";
import { authorize, capabilities } from "@/modules/identity-access/policy";
import {
  GOOGLE_LINK_CONFIRMATION_COOKIE,
  peekGoogleLinkConfirmation,
} from "@/modules/identity-access/google-oidc-state";
import { isGoogleOidcEnabled } from "@/modules/identity-access/google-oidc-config";
import {
  getUserAccessDetail,
  listUsersForAccess,
  type UserAccessListItem,
} from "@/modules/identity-access/user-dal";
import {
  parseUserListQuery,
  USER_PAGE_SIZES,
  type UserPageSize,
} from "@/modules/identity-access/user-list-query";
import {
  ConfirmGoogleIdentityLinkForm,
  DisableFallbackForm,
  EnableFallbackForm,
  LinkGoogleIdentityForm,
  UnlinkGoogleIdentityForm,
  GrantAssignmentForm,
  ProvisionUserForm,
  RevokeAssignmentForm,
  RevokeSessionForm,
  StatusForm,
} from "./action-forms";

export const metadata: Metadata = {
  title: "Pengguna & Akses",
  description: "Kelola identitas, penugasan berscope, sesi, dan akses fallback E-JLS.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function UserAccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const query = parseUserListQuery(rawParams);
  const requestedUserId = singleValue(rawParams.user);
  const googleLinkStatus = singleValue(rawParams.googleLink);

  const result = await loadUserAccessPageData(query, requestedUserId);
  if (result.kind === "denied") return <AccessDenied />;

  const { principal, list, selectedUserId, detail } = result;
  const hasFilters = Boolean(query.query || query.status !== "ALL");
  const canProvisionUsers = authorize(principal, capabilities.usersProvision, {
    type: "SCHOOL",
    schoolId: principal.schoolId,
    reference: null,
  }).allowed;
  const hasRecentAuthentication = hasRecentPrincipalAuthentication(principal);
  const provisionStatus = singleValue(rawParams.provision);

  return (
      <main className="app-main" id="main-content">
        <header className="page-header">
          <div>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <span>Administrasi</span>
              <ChevronRight aria-hidden="true" size={15} />
              <span aria-current="page">Pengguna &amp; Akses</span>
            </nav>
            <div className="page-title-row">
              <span className="page-icon" aria-hidden="true"><UsersRound size={25} /></span>
              <div>
                <h1>Pengguna &amp; Akses</h1>
                <p>Kelola identitas dan privilege dalam batas kewenangan yang diberikan.</p>
              </div>
            </div>
          </div>
          <div className="header-context" role="note">
            <ShieldCheck aria-hidden="true" size={19} />
            <span><strong>Deny by default</strong> · perubahan berisiko memerlukan autentikasi terbaru dan alasan.</span>
          </div>
        </header>

        {provisionStatus === "success" ? (
          <div className="alert provision-success" role="status">
            <CheckCircle2 aria-hidden="true" size={21} />
            <div><strong>Pengguna aktif berhasil dibuat</strong><p>Akun tidak memiliki password, role, identitas Google, atau sesi otomatis. Lanjutkan konfigurasi pada detail pengguna.</p></div>
          </div>
        ) : null}

        {canProvisionUsers ? (
          <details className="card provision-panel">
            <summary>
              <span className="section-title-icon"><UserPlus aria-hidden="true" size={20} /></span>
              <span><span className="eyebrow">Provisioning terkendali</span><strong>Buat pengguna manual</strong></span>
              <ChevronRight className="provision-chevron" aria-hidden="true" size={20} />
            </summary>
            <div className="section-body">
              <p className="section-intro">Akun dibuat aktif dalam sekolah ini, tanpa privilege maupun metode login otomatis. Semua perubahan dicatat dalam audit.</p>
              {hasRecentAuthentication ? <ProvisionUserForm /> : <RecentAuthInline />}
            </div>
          </details>
        ) : null}

        <section className="access-toolbar" aria-label="Pencarian dan filter pengguna">
          <form className="filter-form" method="get">
            <div className="search-field">
              <Search aria-hidden="true" size={19} />
              <label className="sr-only" htmlFor="user-search">Cari pengguna</label>
              <input
                className="input"
                id="user-search"
                name="q"
                type="search"
                defaultValue={query.query}
                placeholder="Cari nama, email, atau username"
                maxLength={100}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="status-filter">Status</label>
              <select className="input" id="status-filter" name="status" defaultValue={query.status}>
                <option value="ALL">Semua status</option>
                <option value="ACTIVE">Aktif</option>
                <option value="INVITED">Diundang</option>
                <option value="SUSPENDED">Ditangguhkan</option>
                <option value="DEACTIVATED">Dinonaktifkan</option>
              </select>
            </div>
            <div className="filter-field page-size-field">
              <label htmlFor="page-size">Baris per halaman</label>
              <select className="input" id="page-size" name="pageSize" defaultValue={query.pageSize}>
                {USER_PAGE_SIZES.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>{pageSize}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary" type="submit"><Search aria-hidden="true" size={18} /> Terapkan</button>
            {hasFilters ? (
              <Link
                className="btn btn-ghost"
                href={buildAccessUrl({ query: "", status: "ALL", page: 1, pageSize: query.pageSize })}
              >
                Hapus filter
              </Link>
            ) : null}
          </form>
          <p className="result-count" aria-live="polite"><strong>{list.total}</strong> pengguna ditemukan</p>
        </section>

        {list.items.length === 0 ? (
          <EmptyUsers hasFilters={hasFilters} pageSize={query.pageSize} />
        ) : (
          <div className="access-workspace">
            <section className="user-list-panel" aria-labelledby="user-list-title">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="eyebrow">Direktori</span>
                  <h2 id="user-list-title">Daftar pengguna</h2>
                </div>
                <span className="page-count">Halaman {list.page} dari {list.totalPages}</span>
              </div>
              <div className="user-list">
                {list.items.map((user) => (
                  <UserListCard
                    key={user.id}
                    user={user}
                    selected={user.id === selectedUserId}
                    href={buildAccessUrl({ ...query, user: user.id })}
                  />
                ))}
              </div>
              <nav className="pagination" aria-label="Pagination pengguna">
                {list.page > 1 ? (
                  <Link className="btn btn-secondary" href={buildAccessUrl({ ...query, page: list.page - 1, user: undefined })}>
                    <ChevronLeft aria-hidden="true" size={18} /> Sebelumnya
                  </Link>
                ) : <span />}
                {list.page < list.totalPages ? (
                  <Link className="btn btn-secondary" href={buildAccessUrl({ ...query, page: list.page + 1, user: undefined })}>
                    Berikutnya <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                ) : null}
              </nav>
            </section>

            <section className="access-detail" aria-label="Detail akses pengguna terpilih">
              {detail ? (
                <UserDetail
                  detail={detail}
                  currentSessionId={principal.sessionId}
                  actorUserId={principal.userId}
                  schoolId={principal.schoolId}
                  googleLinkStatus={googleLinkStatus}
                />
              ) : (
                <div className="empty-state card">
                  <CircleOff aria-hidden="true" size={30} />
                  <h2>Pengguna tidak tersedia</h2>
                  <p>Pengguna mungkin berada di sekolah lain atau sudah tidak tersedia. Pilih pengguna dari daftar.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
  );
}

async function loadUserAccessPageData(query: ReturnType<typeof parseUserListQuery>, requestedUserId: string | undefined) {
  try {
    const principal = await getCurrentPrincipal();
    if (!principal) redirect("/login");

    const list = await listUsersForAccess(query);
    if (list.total > 0 && query.page > list.totalPages) {
      redirect(buildAccessUrl({ ...query, page: list.totalPages, user: requestedUserId }));
    }

    const selectedUserId = isUuid(requestedUserId) ? requestedUserId : list.items[0]?.id;
    const detail = selectedUserId ? await getUserAccessDetail(selectedUserId) : null;
    return { kind: "ready" as const, principal, list, selectedUserId, detail };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    if (error instanceof AuthorizationDeniedError) return { kind: "denied" as const };
    throw error;
  }
}

function UserListCard({ user, selected, href }: { user: UserAccessListItem; selected: boolean; href: string }) {
  return (
    <Link className={`user-list-card ${selected ? "user-list-card-selected" : ""}`} href={href} aria-current={selected ? "true" : undefined}>
      <span className="avatar avatar-large" aria-hidden="true">{initials(user.fullName)}</span>
      <span className="user-card-copy">
        <span className="user-card-title">
          <strong>{user.fullName}</strong>
          <StatusBadge status={user.status} />
        </span>
        <span className="user-email">{user.email}</span>
        <span className="role-summary">
          {user.activeRoleLabels.length > 0 ? user.activeRoleLabels.slice(0, 2).join(" · ") : "Belum ada penugasan aktif"}
        </span>
        <span className="user-card-meta">
          <span><IdCard aria-hidden="true" size={15} /> {sourceLabel(user.provisioningSource)}</span>
          <span><Laptop aria-hidden="true" size={15} /> {user.activeSessions} sesi</span>
          {user.hasFallback ? <span><KeyRound aria-hidden="true" size={15} /> Fallback aktif</span> : null}
        </span>
      </span>
      <ChevronRight className="user-card-chevron" aria-hidden="true" size={20} />
    </Link>
  );
}

async function UserDetail({
  detail,
  currentSessionId,
  actorUserId,
  schoolId,
  googleLinkStatus,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getUserAccessDetail>>>;
  currentSessionId: string;
  actorUserId: string;
  schoolId: string;
  googleLinkStatus: string | undefined;
}) {
  const activeAssignments = detail.assignments.filter((assignment) => assignment.isActive);
  const assignmentHistory = detail.assignments.filter((assignment) => !assignment.isActive);
  const activeSessions = detail.sessions.filter((session) => session.isActive);
  const fallbackEnabled = Boolean(detail.fallbackCredential && !detail.fallbackCredential.disabledAt);
  const googleEnabled = isGoogleOidcEnabled();
  const confirmationToken = (await cookies()).get(GOOGLE_LINK_CONFIRMATION_COOKIE)?.value;
  const pendingGoogleLink = confirmationToken
    ? await peekGoogleLinkConfirmation(confirmationToken)
    : null;
  const confirmedGoogleLink =
    pendingGoogleLink &&
    pendingGoogleLink.actorSessionId === currentSessionId &&
    pendingGoogleLink.actorUserId === actorUserId &&
    pendingGoogleLink.schoolId === schoolId &&
    pendingGoogleLink.targetUserId === detail.id &&
    pendingGoogleLink.targetVersion === detail.version &&
    detail.status === "ACTIVE"
      ? pendingGoogleLink
      : null;
  const hasGoogleIdentity = detail.identities.some(
    (identity) => identity.provider === "GOOGLE_WORKSPACE",
  );
  const hasAnyRiskyPermission = detail.actions.canManageStatus || detail.actions.canManageFallback || detail.actions.canLinkIdentities || detail.actions.canUnlinkIdentities || detail.actions.canRevokeSessions || detail.grantableRoles.length > 0 || detail.assignments.some((assignment) => assignment.canRevoke);

  return (
    <div className="detail-stack">
      <a className="mobile-back-link" href="#user-list-title"><ChevronLeft aria-hidden="true" size={17} /> Kembali ke daftar</a>

      <article className="profile-card card">
        <div className="profile-main">
          <span className="avatar avatar-profile" aria-hidden="true">{initials(detail.fullName)}</span>
          <div>
            <div className="profile-name-row">
              <h2>{detail.fullName}</h2>
              <StatusBadge status={detail.status} />
            </div>
            <p>{detail.email}</p>
            <div className="profile-meta">
              <span><Fingerprint aria-hidden="true" size={16} /> {sourceLabel(detail.provisioningSource)}</span>
              <span><Clock3 aria-hidden="true" size={16} /> Login terakhir {formatRelativeDate(detail.lastLoginAt)}</span>
              {detail.actions.isSelf ? <span><UserCheck aria-hidden="true" size={16} /> Akun Anda</span> : null}
            </div>
          </div>
        </div>
        <div className="profile-stats" aria-label="Ringkasan akses">
          <span><strong>{activeAssignments.length}</strong> penugasan aktif</span>
          <span><strong>{activeSessions.length}</strong> sesi aktif</span>
          <span><strong>{detail.grantableRoles.length}</strong> role dapat diberikan</span>
        </div>
      </article>

      {hasAnyRiskyPermission && !detail.actions.hasRecentAuthentication ? (
        <div className="alert alert-warning" role="status">
          <ShieldAlert aria-hidden="true" size={21} />
          <div>
            <strong>Autentikasi terbaru diperlukan</strong>
            <p>Keluar lalu masuk kembali untuk menjalankan perubahan privilege berisiko. Data tetap dapat ditinjau.</p>
          </div>
        </div>
      ) : null}

      <DetailSection icon={<IdCard size={20} />} eyebrow="Identity" title="Identitas & provisioning">
        <dl className="definition-grid">
          <div><dt>Sumber akun</dt><dd>{sourceLabel(detail.provisioningSource)}</dd></div>
          <div><dt>Status provisioning</dt><dd><StatusBadge status={detail.status} /></dd></div>
          <div><dt>Dibuat</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
          <div><dt>Diperbarui</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div>
        </dl>
        {detail.identities.length > 0 ? (
          <div className="subsection">
            <h4>Identitas eksternal tertaut</h4>
            {detail.identities.map((identity) => (
              <div className="record-row record-row-action" key={identity.id}>
                <div className="record-copy"><strong>{identityProviderLabel(identity.provider)}</strong><span>Ditautkan {formatDateTime(identity.linkedAt)}</span></div>
                <div className="record-actions">
                  <StatusPill tone={identity.emailVerified ? "success" : "warning"} icon={identity.emailVerified ? <BadgeCheck size={15} /> : <AlertTriangle size={15} />}>
                    {identity.emailVerified ? "Email terverifikasi" : "Verifikasi belum tercatat"}
                  </StatusPill>
                  {identity.provider === "GOOGLE_WORKSPACE" && detail.actions.canUnlinkIdentities ? (
                    detail.actions.hasRecentAuthentication ? (
                      <UnlinkGoogleIdentityForm identityId={identity.id} targetUserId={detail.id} expectedVersion={detail.version} />
                    ) : <span className="muted-note">Perlu autentikasi terbaru</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyInline
            icon={<Fingerprint size={20} />}
            title="Belum ada identitas Google tertaut"
            copy={googleEnabled
              ? "Verifikasi eksplisit oleh Admin Akses diperlukan sebelum login Google dapat digunakan."
              : "Google Workspace belum diaktifkan; login fallback tetap tersedia."}
          />
        )}

        {googleLinkStatus === "error" ? (
          <div className="alert alert-warning" role="status">
            <AlertTriangle aria-hidden="true" size={20} />
            <div><strong>Verifikasi Google tidak selesai</strong><p>Coba kembali tanpa mengubah identitas pengguna.</p></div>
          </div>
        ) : null}

        {googleLinkStatus === "confirm" && confirmedGoogleLink ? (
          <div className="subsection action-subsection">
            <div className="subsection-heading">
              <div><h4>Konfirmasi identitas Google</h4><p>Verifikasi berlaku satu kali dan kedaluwarsa dalam sepuluh menit.</p></div>
              <StatusPill tone="success" icon={<BadgeCheck size={15} />}>Google terverifikasi</StatusPill>
            </div>
            <ConfirmGoogleIdentityLinkForm email={confirmedGoogleLink.email} />
          </div>
        ) : googleLinkStatus === "confirm" ? (
          <div className="alert alert-warning" role="status">
            <AlertTriangle aria-hidden="true" size={20} />
            <div><strong>Konfirmasi tidak tersedia</strong><p>Verifikasi mungkin kedaluwarsa atau bukan milik sesi dan target ini.</p></div>
          </div>
        ) : null}

        {googleEnabled && detail.actions.canLinkIdentities && !hasGoogleIdentity && detail.status === "ACTIVE" && !confirmedGoogleLink ? (
          detail.actions.hasRecentAuthentication ? (
            <div className="subsection action-subsection">
              <div className="subsection-heading">
                <div><h4>Tautkan Google Workspace</h4><p>Masuk ke akun Google milik pengguna target, lalu konfirmasi hasilnya di halaman ini.</p></div>
                <StatusPill tone="info" icon={<ShieldCheck size={15} />}>Tanpa auto-link email</StatusPill>
              </div>
              <LinkGoogleIdentityForm targetUserId={detail.id} expectedVersion={detail.version} />
            </div>
          ) : <RecentAuthInline />
        ) : null}
      </DetailSection>

      <DetailSection icon={<ShieldCheck size={20} />} eyebrow="Authorization" title="Role & scope aktif" count={activeAssignments.length}>
        {activeAssignments.length > 0 ? activeAssignments.map((assignment) => (
          <AssignmentRecord key={assignment.id} assignment={assignment} recent={detail.actions.hasRecentAuthentication} />
        )) : <EmptyInline icon={<ShieldEllipsis size={20} />} title="Belum ada penugasan aktif" copy="Pengguna tidak memperoleh capability dari assignment aktif saat ini." />}

        {detail.grantableRoles.length > 0 ? (
          <div className="subsection action-subsection">
            <div className="subsection-heading">
              <div><h4>Berikan penugasan</h4><p>Scope slice saat ini dibatasi pada seluruh sekolah.</p></div>
              <StatusPill tone="info" icon={<ShieldCheck size={15} />}>Sesuai grant boundary</StatusPill>
            </div>
            {detail.actions.hasRecentAuthentication ? (
              <GrantAssignmentForm targetUserId={detail.id} roles={detail.grantableRoles} />
            ) : <RecentAuthInline />}
          </div>
        ) : (
          <PermissionInline copy={detail.actions.isSelf ? "Penugasan ke akun sendiri tidak diizinkan." : "Tidak ada role scope sekolah di dalam grant boundary Anda."} />
        )}
      </DetailSection>

      <DetailSection icon={<History size={20} />} eyebrow="History" title="Riwayat penugasan" count={assignmentHistory.length}>
        {assignmentHistory.length > 0 ? assignmentHistory.map((assignment) => (
          <AssignmentRecord key={assignment.id} assignment={assignment} recent={detail.actions.hasRecentAuthentication} />
        )) : <EmptyInline icon={<History size={20} />} title="Belum ada riwayat" copy="Penugasan yang kedaluwarsa atau dicabut akan tampil di sini." />}
      </DetailSection>

      <DetailSection icon={<ShieldEllipsis size={20} />} eyebrow="Delegation" title="Grant boundary & delegasi">
        {activeAssignments.some((assignment) => assignment.grantBoundaries.length > 0) ? (
          activeAssignments.map((assignment) => assignment.grantBoundaries.length > 0 ? (
            <div className="boundary-block" key={assignment.id}>
              <strong>{assignment.role.name} · {assignment.scopeLabel}</strong>
              <ul>
                {assignment.grantBoundaries.map((boundary) => (
                  <li key={`${boundary.grantableRole.key}-${boundary.boundaryScopeType}-${boundary.boundaryScopeReference ?? "school"}`}>
                    Dapat mengelola <strong>{boundary.grantableRole.name}</strong> pada {scopeLabel(boundary.boundaryScopeType, boundary.boundaryScopeReference)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null)
        ) : <EmptyInline icon={<LockKeyhole size={20} />} title="Tidak ada delegasi aktif" copy="Role aktif pengguna ini tidak memiliki grant boundary yang dapat diteruskan." />}
      </DetailSection>

      <DetailSection icon={<Laptop size={20} />} eyebrow="Sessions" title="Sesi perangkat" count={activeSessions.length}>
        {detail.sessions.length > 0 ? detail.sessions.map((session) => (
          <div className="record-row record-row-action" key={session.id}>
            <div className="record-icon"><Laptop aria-hidden="true" size={19} /></div>
            <div className="record-copy">
              <strong>{session.deviceLabel ?? "Perangkat tidak diberi label"}</strong>
              <span>{authMethodLabel(session.authMethod)} · aktif terakhir {formatDateTime(session.lastSeenAt)}</span>
              <span>Berakhir {formatDateTime(session.expiresAt)}{session.id === currentSessionId ? " · sesi saat ini" : ""}</span>
            </div>
            <div className="record-actions">
              <StatusPill tone={session.isActive ? "success" : "neutral"} icon={session.isActive ? <CheckCircle2 size={15} /> : <CircleOff size={15} />}>
                {session.isActive ? "Aktif" : session.revokedAt ? "Dicabut" : "Kedaluwarsa"}
              </StatusPill>
              {session.isActive && detail.actions.canRevokeSessions ? (
                detail.actions.hasRecentAuthentication ? <RevokeSessionForm sessionId={session.id} expectedVersion={session.version} isCurrent={session.id === currentSessionId} /> : <span className="muted-note">Perlu autentikasi terbaru</span>
              ) : null}
            </div>
          </div>
        )) : <EmptyInline icon={<Laptop size={20} />} title="Belum ada sesi" copy="Sesi login pengguna akan tampil di sini." />}
      </DetailSection>

      <DetailSection icon={<KeyRound size={20} />} eyebrow="Recovery access" title="Kredensial fallback">
        <div className="fallback-summary">
          <div>
            <StatusPill tone={fallbackEnabled ? "success" : "neutral"} icon={fallbackEnabled ? <CheckCircle2 size={15} /> : <CircleOff size={15} />}>
              {fallbackEnabled ? "Fallback aktif" : "Fallback nonaktif"}
            </StatusPill>
            <p>{detail.fallbackCredential ? `Kata sandi terakhir diubah ${formatDateTime(detail.fallbackCredential.passwordChangedAt)}.` : "Belum pernah diaktifkan untuk akun ini."}</p>
            {detail.fallbackCredential?.lockedUntil && detail.fallbackCredential.lockedUntil > new Date() ? <p className="danger-copy">Dikunci sementara sampai {formatDateTime(detail.fallbackCredential.lockedUntil)}.</p> : null}
          </div>
          {detail.fallbackCredential ? <span className="attempt-count">Percobaan gagal: <strong>{detail.fallbackCredential.failedAttempts ?? 0}</strong></span> : null}
        </div>
        {detail.actions.canManageFallback ? (
          detail.actions.hasRecentAuthentication ? (
            <div className="subsection action-subsection">
              <EnableFallbackForm targetUserId={detail.id} expectedVersion={detail.fallbackCredential?.version ?? 0} />
              {fallbackEnabled && detail.fallbackCredential ? <DisableFallbackForm targetUserId={detail.id} expectedVersion={detail.fallbackCredential.version} /> : null}
            </div>
          ) : <RecentAuthInline />
        ) : <PermissionInline copy={detail.actions.isSelf ? "Fallback akun sendiri tidak dapat diubah dari P-10." : "Anda tidak memiliki capability untuk mengelola fallback."} />}
      </DetailSection>

      <DetailSection icon={<History size={20} />} eyebrow="Audit" title="Jejak privilege" count={detail.auditLogs.length}>
        {!detail.canReadAudit ? (
          <PermissionInline copy="Jejak privilege dilindungi capability iam.audit.read yang terpisah." />
        ) : detail.auditLogs.length > 0 ? (
          <ol className="audit-list">
            {detail.auditLogs.map((log) => (
              <li key={log.id}>
                <span className={`audit-marker audit-${log.outcome.toLowerCase()}`} aria-hidden="true" />
                <div><strong>{auditEventLabel(log.eventType)}</strong><span>{log.actorUser?.fullName ?? "Sistem"} · {formatDateTime(log.occurredAt)}</span></div>
                <StatusPill tone={log.outcome === "SUCCEEDED" ? "success" : log.outcome === "DENIED" ? "warning" : "danger"} icon={log.outcome === "SUCCEEDED" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}>
                  {auditOutcomeLabel(log.outcome)}
                </StatusPill>
              </li>
            ))}
          </ol>
        ) : <EmptyInline icon={<History size={20} />} title="Belum ada peristiwa privilege" copy="Mutasi yang memengaruhi pengguna ini akan tampil setelah dicatat." />}
      </DetailSection>

      <DetailSection danger icon={<ShieldAlert size={20} />} eyebrow="Danger zone" title="Status akses pengguna">
        <p className="section-intro">Penangguhan atau penonaktifan mencabut semua sesi aktif. Histori penugasan dan audit tetap dipertahankan.</p>
        {detail.actions.canManageStatus ? (
          detail.actions.hasRecentAuthentication ? <StatusForm targetUserId={detail.id} expectedVersion={detail.version} currentStatus={detail.status} /> : <RecentAuthInline />
        ) : <PermissionInline copy={detail.actions.isSelf ? "Status akun sendiri tidak dapat diubah." : "Anda tidak memiliki capability untuk mengubah lifecycle pengguna."} />}
      </DetailSection>
    </div>
  );
}

function AssignmentRecord({ assignment, recent }: { assignment: NonNullable<Awaited<ReturnType<typeof getUserAccessDetail>>>["assignments"][number]; recent: boolean }) {
  return (
    <div className="record-row record-row-action">
      <div className="record-icon"><ShieldCheck aria-hidden="true" size={19} /></div>
      <div className="record-copy">
        <strong>{assignment.role.name}</strong>
        <span>{assignment.scopeLabel} · {scopeTypeLabel(assignment.scopeType)}</span>
        <span>{formatDateTime(assignment.activeFrom)} — {assignment.activeUntil ? formatDateTime(assignment.activeUntil) : "tanpa batas waktu"}</span>
      </div>
      <div className="record-actions">
        <StatusPill tone={assignment.isActive ? "success" : "neutral"} icon={assignment.isActive ? <CheckCircle2 size={15} /> : <CircleOff size={15} />}>
          {assignment.isActive ? "Aktif" : assignment.revokedAt ? "Dicabut" : "Kedaluwarsa"}
        </StatusPill>
        {assignment.isActive && assignment.canRevoke ? (
          recent ? <RevokeAssignmentForm assignmentId={assignment.id} expectedVersion={assignment.version} roleName={assignment.role.name} /> : <span className="muted-note">Perlu autentikasi terbaru</span>
        ) : null}
      </div>
    </div>
  );
}

function DetailSection({ icon, eyebrow, title, count, danger = false, children }: { icon: React.ReactNode; eyebrow: string; title: string; count?: number; danger?: boolean; children: React.ReactNode }) {
  return (
    <article className={`detail-section card ${danger ? "danger-section" : ""}`}>
      <div className="panel-heading">
        <div className="section-title-icon" aria-hidden="true">{icon}</div>
        <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>
        {typeof count === "number" ? <span className="count-badge" aria-label={`${count} item`}>{count}</span> : null}
      </div>
      <div className="section-body">{children}</div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    ACTIVE: { label: "Aktif", tone: "success", icon: <CheckCircle2 size={14} /> },
    INVITED: { label: "Diundang", tone: "info", icon: <CalendarClock size={14} /> },
    SUSPENDED: { label: "Ditangguhkan", tone: "warning", icon: <AlertTriangle size={14} /> },
    DEACTIVATED: { label: "Dinonaktifkan", tone: "danger", icon: <Ban size={14} /> },
  }[status] ?? { label: status, tone: "neutral", icon: <CircleOff size={14} /> };
  return <StatusPill tone={config.tone} icon={config.icon}>{config.label}</StatusPill>;
}

function StatusPill({ tone, icon, children }: { tone: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <span className={`status-pill status-${tone}`}>{icon}{children}</span>;
}

function EmptyInline({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="empty-inline"><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></div>;
}

function PermissionInline({ copy }: { copy: string }) {
  return <div className="permission-inline" role="note"><LockKeyhole aria-hidden="true" size={19} /><p><strong>Aksi dibatasi</strong><span>{copy}</span></p></div>;
}

function RecentAuthInline() {
  return <div className="permission-inline permission-warning" role="note"><ShieldAlert aria-hidden="true" size={19} /><p><strong>Masuk ulang diperlukan</strong><span>Autentikasi terbaru dibutuhkan sebelum perubahan ini dapat dilakukan.</span></p></div>;
}

function EmptyUsers({ hasFilters, pageSize }: { hasFilters: boolean; pageSize: UserPageSize }) {
  return (
    <section className="empty-state card" aria-labelledby="empty-users-title">
      {hasFilters ? <Search aria-hidden="true" size={34} /> : <UserPlus aria-hidden="true" size={34} />}
      <h2 id="empty-users-title">{hasFilters ? "Tidak ada hasil yang cocok" : "Belum ada pengguna"}</h2>
      <p>{hasFilters ? "Periksa kata kunci atau hapus filter untuk melihat seluruh pengguna." : "Provisioning pengguna pertama harus dilakukan melalui alur bootstrap atau sumber yang disetujui."}</p>
      {hasFilters ? (
        <Link
          className="btn btn-secondary"
          href={buildAccessUrl({ query: "", status: "ALL", page: 1, pageSize })}
        >
          Hapus semua filter
        </Link>
      ) : null}
    </section>
  );
}

function AccessDenied() {
  return (
    <main className="app-main" id="main-content">
      <section className="empty-state card denied-state" aria-labelledby="denied-title">
        <LockKeyhole aria-hidden="true" size={36} />
        <span className="eyebrow">Akses dibatasi</span>
        <h1 id="denied-title">Anda tidak memiliki izin melihat P-10</h1>
        <p>Halaman ini memerlukan capability <strong>iam.users.read</strong> pada scope sekolah yang aktif.</p>
        <p>Hubungi Admin Akses sekolah bila tugas Anda memerlukan halaman ini.</p>
      </section>
    </main>
  );
}

function buildAccessUrl(input: {
  query: string;
  status: string;
  page: number;
  pageSize: UserPageSize;
  user?: string;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.status !== "ALL") params.set("status", input.status);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== 25) params.set("pageSize", String(input.pageSize));
  if (input.user) params.set("user", input.user);
  const value = params.toString();
  return value ? `/admin/akses?${value}` : "/admin/akses";
}

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
function formatDateTime(value: Date) { return dateFormatter.format(value); }
function formatRelativeDate(value: Date | null) { return value ? formatDateTime(value) : "belum pernah"; }
function sourceLabel(value: string) { return ({ GOOGLE_WORKSPACE: "Google Workspace", MANUAL: "Manual", IMPORT: "Impor" } as Record<string, string>)[value] ?? value; }
function identityProviderLabel(value: string) { return value === "GOOGLE_WORKSPACE" ? "Google Workspace" : value; }
function authMethodLabel(value: string) { return value === "FALLBACK" ? "Fallback" : "Google Workspace"; }
function scopeTypeLabel(value: string) { return ({ SCHOOL: "Scope sekolah", PROGRAM: "Scope program", CLASS: "Scope kelas", ROOM: "Scope ruang", SELF: "Scope diri" } as Record<string, string>)[value] ?? value; }
function scopeLabel(type: string, reference: string | null) { return type === "SCHOOL" ? "seluruh sekolah" : `${scopeTypeLabel(type).replace("Scope ", "").toLowerCase()} ${reference ?? "tertentu"}`; }
function auditOutcomeLabel(value: string) { return ({ SUCCEEDED: "Berhasil", DENIED: "Ditolak", FAILED: "Gagal" } as Record<string, string>)[value] ?? value; }
function auditEventLabel(value: string) {
  return ({
    "iam.user.provisioned": "Pengguna manual dibuat",
    "iam.assignment.granted": "Penugasan diberikan",
    "iam.assignment.revoked": "Penugasan dicabut",
    "iam.session.revoked": "Sesi dicabut",
    "iam.fallback.enabled": "Fallback diaktifkan",
    "iam.fallback.disabled": "Fallback dinonaktifkan",
    "iam.identity.google.linked": "Identitas Google ditautkan",
    "iam.identity.google.unlinked": "Identitas Google dilepas",
    "iam.user.status.changed": "Status pengguna diubah",
    "auth.fallback.succeeded": "Login fallback berhasil",
    "auth.fallback.denied": "Login fallback ditolak",
    "auth.session.ended": "Sesi diakhiri",
    "iam.bootstrap.completed": "Bootstrap administrator selesai",
  } as Record<string, string>)[value] ?? "Peristiwa akses";
}
