import type { Metadata } from "next";
import { Blocks, CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "./actions";
import { resolveImplementedLanding } from "@/modules/identity-access/landing";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";

export const metadata: Metadata = {
  title: "Ruang Kerja",
  description: "Ruang kerja aman untuk modul E-JLS yang tersedia.",
};

export default async function Home() {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    redirect("/login");
  }

  const destination = resolveImplementedLanding(principal);
  if (destination) {
    redirect(destination);
  }

  return (
    <main className="workspace-landing" id="main-content">
      <section className="workspace-card" aria-labelledby="workspace-title">
        <div className="workspace-brand">
          <span className="brand-mark" aria-hidden="true">EJ</span>
          <div>
            <span className="eyebrow">Ruang kerja aman</span>
            <strong>E-JLS</strong>
          </div>
        </div>

        <div className="workspace-state-icon" aria-hidden="true">
          <Blocks size={34} />
        </div>
        <h1 id="workspace-title">Modul untuk tugas Anda belum tersedia</h1>
        <p className="workspace-lead">
          Sesi Anda valid. Foundation saat ini baru membuka modul yang sesuai dengan capability
          terimplementasi; akses tambahan tidak diberikan secara otomatis.
        </p>

        <div className="workspace-session" role="status">
          <CheckCircle2 aria-hidden="true" size={21} />
          <div>
            <strong>{principal.fullName}</strong>
            <span>{principal.email}</span>
          </div>
          <span className="status-pill status-success">
            <ShieldCheck aria-hidden="true" size={14} /> Sesi aktif
          </span>
        </div>

        <div className="workspace-guidance" role="note">
          <ShieldCheck aria-hidden="true" size={20} />
          <p>
            Hubungi pengelola sekolah bila penugasan Anda memerlukan modul yang sudah tersedia.
            Modul jurnal, absensi, dan akademik belum dibuka pada gate Foundation ini.
          </p>
        </div>

        <form action={logout}>
          <button className="btn btn-secondary" type="submit">
            <LogOut aria-hidden="true" size={18} /> Keluar dari E-JLS
          </button>
        </form>
      </section>
    </main>
  );
}
