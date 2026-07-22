import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { logout } from "@/app/actions";
import { getDatabase } from "@/lib/database";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    redirect("/login");
  }

  const school = await getDatabase().school.findUnique({
    where: { id: principal.schoolId },
    select: { name: true, code: true },
  });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>

      <aside className="app-sidebar" aria-label="Navigasi utama">
        <Link className="brand-lockup sidebar-brand" href="/admin/akses" aria-label="E-JLS, Pengguna dan Akses">
          <span className="brand-mark" aria-hidden="true">EJ</span>
          <span className="brand-copy">
            <strong>E-JLS</strong>
            <small>{school?.name ?? "Layanan sekolah"}</small>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="Modul aplikasi">
          <span className="nav-section-label">Administrasi</span>
          <Link className="nav-link nav-link-active" href="/admin/akses" aria-current="page">
            <UsersRound aria-hidden="true" size={20} />
            <span>Pengguna &amp; Akses</span>
          </Link>
        </nav>

        <div className="sidebar-security" role="note">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <strong>Akses berscope</strong>
            <span>Setiap perubahan privilege divalidasi dan diaudit.</span>
          </div>
        </div>

        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{initials(principal.fullName)}</span>
          <span className="account-copy">
            <strong>{principal.fullName}</strong>
            <small>{principal.email}</small>
          </span>
          <form action={logout}>
            <button className="icon-button icon-button-inverse" type="submit" aria-label="Keluar dari E-JLS" title="Keluar">
              <LogOut aria-hidden="true" size={20} />
            </button>
          </form>
        </div>
      </aside>

      <div className="app-column">
        <header className="mobile-header">
          <Link className="brand-lockup" href="/admin/akses" aria-label="E-JLS, Pengguna dan Akses">
            <span className="brand-mark" aria-hidden="true">EJ</span>
            <span>
              <strong>E-JLS</strong>
              <small>{school?.code ?? "Sekolah"}</small>
            </span>
          </Link>
          <div className="mobile-account">
            <span className="avatar" aria-hidden="true">{initials(principal.fullName)}</span>
            <form action={logout}>
              <button className="icon-button" type="submit" aria-label="Keluar dari E-JLS" title="Keluar">
                <LogOut aria-hidden="true" size={20} />
              </button>
            </form>
          </div>
        </header>

        {children}

        <footer className="app-footer">
          <span>{school?.name ?? "Layanan akademik sekolah"}</span>
          <span>Build 0.1.0 · Akses terbatas</span>
        </footer>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navigasi utama mobile">
        <Link href="/admin/akses" aria-current="page">
          <UsersRound aria-hidden="true" size={21} />
          <span>Pengguna &amp; Akses</span>
        </Link>
      </nav>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}
