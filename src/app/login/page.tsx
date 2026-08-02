import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  isGoogleOidcEnabled,
  requireGoogleOidcSettings,
} from "@/modules/identity-access/google-oidc-config";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke layanan E-Jurnal dan Lab Management System.",
};

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.22Z" />
      <path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.6Z" />
      <path fill="#FBBC05" d="M6.54 13.69a5.86 5.86 0 0 1 0-3.38V7.78H3.3a9.74 9.74 0 0 0 0 8.44l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.28c1.43 0 2.72.49 3.73 1.46l2.8-2.8C16.84 3.35 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.7 5.38l3.24 2.53C7.31 8 9.46 6.28 12 6.28Z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentPrincipal()) {
    redirect("/");
  }

  const googleOidcEnabled = isGoogleOidcEnabled();
  const googleSchoolCode = googleOidcEnabled ? requireGoogleOidcSettings().schoolCode : undefined;
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
                <GoogleIcon />
                Masuk dengan Google Workspace
              </a>
            ) : (
              <button className="btn btn-google" type="button" disabled aria-describedby="google-login-status">
                <GoogleIcon />
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
          <LoginForm schoolCode={googleSchoolCode} />
        </div>
        <footer className="login-footer">
          <span>Butuh bantuan? Hubungi Admin Akses sekolah.</span>
          <span>Build 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
