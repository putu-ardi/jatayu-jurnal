import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke layanan E-Jurnal dan Lab Management System.",
};

export default async function LoginPage() {
  if (await getCurrentPrincipal()) {
    redirect("/");
  }

  return (
    <main className="login-page" id="main-content">
      <section className="login-intro" aria-labelledby="login-intro-title">
        <a className="brand-lockup brand-lockup-inverse" href="#login-panel" aria-label="E-JLS, ke formulir masuk">
          <span className="brand-mark" aria-hidden="true">EJ</span>
          <span>
            <strong>E-JLS</strong>
            <small>Layanan jurnal dan laboratorium sekolah</small>
          </span>
        </a>

        <div className="login-intro-copy">
          <span className="eyebrow eyebrow-inverse">Akses internal sekolah</span>
          <h1 id="login-intro-title">Satu ruang kerja untuk bukti pembelajaran yang tertib.</h1>
          <p>
            Masuk menggunakan akun fallback yang telah diaktifkan khusus oleh Admin Akses sekolah.
          </p>
          <ul className="trust-list" aria-label="Perlindungan akses">
            <li><CheckCircle2 aria-hidden="true" size={20} /> Sesi dapat dicabut segera oleh pengelola berwenang</li>
            <li><CheckCircle2 aria-hidden="true" size={20} /> Perubahan privilege tercatat dalam jejak audit</li>
            <li><CheckCircle2 aria-hidden="true" size={20} /> Akses dibatasi menurut sekolah dan scope penugasan</li>
          </ul>
        </div>

        <p className="login-intro-footer">E-Jurnal &amp; Lab Management System</p>
      </section>

      <section className="login-panel" id="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-icon" aria-hidden="true"><ShieldCheck size={25} /></span>
            <div>
              <span className="eyebrow">Selamat datang</span>
              <h2 id="login-title">Masuk ke E-JLS</h2>
            </div>
          </div>
          <p className="login-lead">
            Masukkan identitas sekolah dan akun yang sudah diprovisikan.
          </p>

          <LoginForm />

          <div className="sso-notice" role="note">
            <strong>Google Workspace belum tersedia</strong>
            <p>Integrasi login utama belum dikonfigurasi pada environment ini. Gunakan akun fallback aktif.</p>
          </div>
        </div>
        <footer className="login-footer">
          <span>Butuh bantuan? Hubungi Admin Akses sekolah.</span>
          <span>Build 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
