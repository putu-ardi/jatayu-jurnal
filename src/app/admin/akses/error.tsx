"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function UserAccessError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("P-10 gagal dimuat", error.digest ?? "tanpa-digest");
  }, [error.digest]);

  return (
    <main className="app-main" id="main-content">
      <section className="empty-state card denied-state" role="alert" aria-labelledby="access-error-title">
        <AlertTriangle aria-hidden="true" size={36} />
        <span className="eyebrow">Gangguan sementara</span>
        <h1 id="access-error-title">Data pengguna belum dapat dimuat</h1>
        <p>Tidak ada perubahan akses yang dilakukan. Coba muat kembali; bila berulang, sampaikan kode referensi kepada administrator sistem.</p>
        {error.digest ? <p>Kode referensi: <strong>{error.digest}</strong></p> : null}
        <button className="btn btn-primary" type="button" onClick={() => unstable_retry()}>
          <RefreshCw aria-hidden="true" size={18} /> Coba lagi
        </button>
      </section>
    </main>
  );
}
