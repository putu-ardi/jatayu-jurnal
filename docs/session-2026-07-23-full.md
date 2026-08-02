# Sesi: Controlled User Provisioning & Google SSO UAT

- Tanggal: 2026-07-23
- Workspace: `jatayu-jurnal` (lokal)
- Penulis: Automated session export

## Ringkasan singkat
Sesi ini menuntaskan implementasi controlled manual provisioning, explicit Google Workspace identity linking (two-step verify + confirm), dan happy-path credentialed Google login UAT pada runtime lokal. Semua perubahan kode terkait provisioning, policy, katalog, migration, dan UI sudah diterapkan dan diverifikasi secara lokal. Foundation gate tetap **Belum diterima** — langkah staging, review, dan sign-off stakeholder masih diperlukan.

## Hasil utama
- Controlled provisioning implemented: capability `iam.users.provision` tersedia dan dipetakan ke `admin-akses`.
- Provisioned user: I Gede Wira Dharma Naradha (`naradha@smkn1klk.sch.id`) — provisioning manual, status `ACTIVE`, `provisioningSource=MANUAL`.
- Explicit Google linking: identity `(provider=GOOGLE_WORKSPACE, issuer, subject)` ditulis setelah verification + confirmation.
- Credentialed Google login: `auth.google.succeeded` tercatat dan satu sesi Google aktif dibuat.
- Tidak ada credential, role, atau session yang dibuat otomatis oleh provisioning.

## Bukti (snapshot runtime & audit)
- `user_identities` (Google): 1
- Active users: 2
- Audit events (relevan):
  - `iam.user.provisioned` — SUCCEEDED (provision manual)
  - `auth.google.denied` — DENIED (login sebelum link)
  - `iam.identity.google.linked` — SUCCEEDED (link confirm)
  - `auth.google.succeeded` — SUCCEEDED (login via Google)
- Database assertions run via local Docker Compose; health endpoints returned HTTP 200.

## File & kode penting terkait
- `src/modules/identity-access/google-authentication.ts` — OIDC flow, login vs link handling.
- `src/app/admin/akses/*` — UI forms/actions: `ProvisionUserForm`, `LinkGoogleIdentityForm`, `ConfirmGoogleIdentityLinkForm`, `UnlinkGoogleIdentityForm`.
- `src/modules/identity-access/mutations.ts` — `provisionManualUser`, `unlinkGoogleIdentity`.
- `prisma/migrations/20260723120000_add_manual_user_provision_permission/migration.sql` — migration permission.
- `docs/foundation-gate-ledger.md` — ledger diperbarui dengan bukti UAT lokal.
- `docs/session-2026-07-23-controlled-user-provisioning.md` — catatan sesi terperinci diperbarui.

## Langkah reproduksi (singkat)
1. Jalankan compose lokal sesuai `compose.yaml` (Nginx publik `127.0.0.1:8080`).
2. Login sebagai Admin Akses (fallback + CAPTCHA) dan buka `/admin/akses`.
3. Buat pengguna manual (nama, email sekolah, username optional, alasan ≥12 chars).
4. Dari detail pengguna target: klik **Verifikasi dengan Google**, pilih akun Google target, kembali ke Admin, lalu **Konfirmasi tautan Google**.
5. Logout Admin, lalu pada `/login` klik **Masuk dengan Google Workspace** dan pilih akun target. Verifikasi `auth.google.succeeded` dan sesi aktif di DB.
6. Untuk unlink UAT: biarkan sesi target tetap aktif; dari sesi Admin berbeda, pilih **Lepas identitas**, isi alasan ≥12 chars, klik konfirmasi; verifikasi audit `iam.identity.google.unlinked` dan bahwa sesi Google aktif target dicabut.

## Next steps yang direkomendasikan
- Selesaikan UAT unlink/revocation, relink, dan negative-state (suspended/deactivated) secara lokal.
- Jalankan staging runbook (migration, readiness failure/recovery, backup/restore, secret custody, observability) pada staging HTTPS.
- Jalankan accessibility manual (screen reader, zoom/reflow) dan security review independen.
- Minta sign-off stakeholder untuk menutup Foundation gate sebelum memulai Slice 1 (academic kernel).

## Catatan kebijakan & keamanan
- Tidak pernah mengirim password, client secret, token, cookie, atau credential Google melalui chat atau dokumen ini.
- Identity key adalah `(provider, issuer, subject)` — email hanya untuk review.
- No auto-link by email; deny-by-default for login until explicit link.

---
Simpan file ini bersama bukti yang sudah di-commit ke `docs/` dan hubungkan ke evidence run jika perlu diattach ke issue atau runbook staging.
