import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { isGoogleOidcEnabled } from "@/modules/identity-access/google-oidc-config";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke layanan E-Jurnal dan Lab Management System.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentPrincipal()) {
    redirect("/");
  }

  const googleOidcEnabled = isGoogleOidcEnabled();
  const googleLoginFailed = (await searchParams).error === "google";

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
            Gunakan akun Google Workspace sekolah atau akses fallback yang diaktifkan khusus oleh Admin Akses.
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
            Masuk hanya dengan akun yang sudah diprovisikan dan ditautkan oleh Admin Akses.
          </p>

          {googleLoginFailed ? (
            <div className="alert alert-danger google-login-alert" role="alert">
              <AlertCircle aria-hidden="true" size={20} />
              <div>
                <strong>Login Google tidak berhasil</strong>
                <p>Akun belum tertaut, tidak aktif, atau tidak memenuhi kebijakan Workspace sekolah.</p>
              </div>
            </div>
          ) : null}

          <div className="google-login-section">
            {googleOidcEnabled ? (
              <a className="btn btn-google" href="/api/auth/google/start">
                <LogIn aria-hidden="true" size={19} />
                Masuk dengan Google Workspace
              </a>
            ) : (
              <button className="btn btn-google" type="button" disabled aria-describedby="google-login-status">
                <LogIn aria-hidden="true" size={19} />
                Masuk dengan Google Workspace
              </button>
            )}
            <p id="google-login-status">
              {googleOidcEnabled
                ? "Akun Google harus berasal dari domain sekolah dan sudah ditautkan ke pengguna E-JLS."
                : "Google Workspace belum diaktifkan pada environment ini. Tombol akan aktif setelah konfigurasi OIDC sekolah selesai."}
            </p>
          </div>

          <div className="login-divider"><span>Akses fallback</span></div>
          <LoginForm />
        </div>
        <footer className="login-footer">
          <span>Butuh bantuan? Hubungi Admin Akses sekolah.</span>
          <span>Build 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
