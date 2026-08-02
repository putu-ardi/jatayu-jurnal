# Catatan Sesi — Controlled User Provisioning dan Google SSO UAT

- **Tanggal:** 23 Juli 2026
- **Workspace:** `C:\laragon\www\jatayu-jurnal`
- **Status Foundation:** belum diterima stakeholder
- **Status engineering:** implementasi provisioning selesai dan quality gate lokal lulus
- **Status runtime terakhir:** artifact terbaru ter-deploy dan sehat; happy-path provisioning, explicit linking, dan login Google credentialed lulus

> Dokumen ini sengaja tidak memuat password, OAuth client secret, token, cookie, connection string, atau nilai rahasia dari `.env`.

## Pembaruan setelah sesi dilanjutkan

- Docker Desktop dan BuildKit berhasil pulih tanpa reset atau penghapusan volume.
- Image `migrate`, `web`, `worker`, dan `nginx` dibangun ulang secara serial.
- Migration `20260723120000_add_manual_user_provision_permission` berhasil diterapkan; container migration keluar dengan kode `0`.
- Web, worker, dan Nginx direcreate dari image terbaru; PostgreSQL dan Redis lama tetap utuh.
- `/nginx-health`, `/api/health/live`, dan `/api/health/ready` menghasilkan HTTP 200; readiness melaporkan database dan Redis `up`.
- Hanya Nginx mempublikasikan host port `127.0.0.1:8080`; seluruh enam container terverifikasi non-root, read-only, `no-new-privileges`, `cap_drop: ALL`, dan tidak privileged.
- Database mengonfirmasi permission `iam.users.provision` dan mapping role `admin-akses`; agregat saat verifikasi adalah satu pengguna aktif dan nol identity Google Workspace.
- Login publik artifact terbaru berhasil dimuat. Boundary awal OIDC menghasilkan HTTP 307 ke `https://accounts.google.com`, state cookie hadir dengan `HttpOnly`, `SameSite=Lax`, dan `Path=/`, serta response `Cache-Control: no-store`.
- `docs/foundation-gate-ledger.md` diperbarui menjadi 146/146 test dan memuat evidence controlled provisioning/deployment terbaru. Status Foundation tetap **Belum diterima**.
- Operator menyelesaikan credentialed UAT langsung di browser tanpa mengirim password, CAPTCHA, token, atau credential Google melalui chat.
- Pengguna kedua berhasil dibuat melalui UI resmi, login sebelum linking ditolak generik, identity Google ditautkan eksplisit setelah verifikasi dan konfirmasi, lalu login Google berhasil.
- Snapshot pasca-UAT membuktikan pengguna tetap tanpa fallback credential dan tanpa role assignment; satu sesi Google aktif terbentuk dan landing tetap capability-neutral.

## Tujuan sesi

1. Menyelesaikan pekerjaan Foundation/P-10 yang masih parsial sebelum memulai modul jurnal atau absensi.
2. Menyediakan jalur resmi untuk membuat pengguna kedua secara aman.
3. Menjadikan pengguna tersebut target explicit Google identity linking dan UAT login Google.
4. Mempertahankan model deny-by-default, tenant containment, recent authentication, audit, dan no-auto-link berdasarkan email.

## Keputusan keamanan

- Menambahkan capability khusus `iam.users.provision`; capability lifecycle pengguna tidak dipakai ulang.
- Capability diberikan kepada role sistem `admin-akses` melalui katalog dan forward migration.
- Tenant/school pengguna baru selalu berasal dari principal actor, bukan dari input browser.
- Pengguna baru dibuat sebagai `ACTIVE` dengan `provisioningSource=MANUAL`.
- Email dan username dinormalisasi; username bersifat opsional.
- Provisioning **tidak** otomatis membuat:
  - password/fallback credential;
  - role assignment;
  - identitas Google;
  - sesi login.
- Mutasi membutuhkan capability dan autentikasi terbaru, lalu melakukan reauthorization di dalam transaction `Serializable`.
- Duplicate email/username dipetakan menjadi konflik generik tanpa membocorkan detail database.
- Operasi dicatat sebagai audit event `iam.user.provisioned`.
- Bootstrap pertama, seed browser disposable, dan direct SQL tidak boleh dipakai untuk provisioning pengguna operasional.
- Google login tetap hanya memakai identity `(provider, issuer, subject)` yang telah ditautkan eksplisit; email bukan identity key dan bukan dasar auto-link.

## Perubahan implementasi

### Policy, katalog, dan migration

- `src/modules/identity-access/policy.ts`
  - Menambahkan `capabilities.usersProvision = "iam.users.provision"`.
- `src/modules/identity-access/catalog.ts`
  - Menambahkan deskripsi permission provisioning.
  - Role `admin-akses` menerima permission ini melalui mekanisme katalog yang sudah ada pada database baru.
- `prisma/migrations/20260723120000_add_manual_user_provision_permission/migration.sql`
  - Menambahkan/upsert permission `iam.users.provision` dengan risk level `HIGH`.
  - Menautkannya ke role `admin-akses` yang sudah ada.
  - Migration aman untuk database aktif dan tidak memerlukan bootstrap ulang.

### Backend dan Server Action

- `src/modules/identity-access/mutations.ts`
  - Menambahkan `provisionManualUser`.
  - Memeriksa capability dan recent authentication sebelum transaksi.
  - Memuat ulang principal/capability di dalam transaksi.
  - Membuat user tenant-qualified dan mengembalikan hanya `{ id }`.
  - Menulis audit atomik tanpa membuat akses/metode login otomatis.
- `src/app/admin/akses/actions.ts`
  - Menambahkan Server Action `provisionUser`.
  - Memvalidasi nama, email, username opsional, dan alasan dengan Zod.
  - Menormalkan username dan mendelegasikan auth/authz ke DAL.
  - Setelah sukses, me-redirect ke detail pengguna baru.

### UI Admin Akses

- `src/app/admin/akses/action-forms.tsx`
  - Menambahkan `ProvisionUserForm`.
  - Field: nama lengkap, email sekolah, username opsional, dan alasan audit.
  - UI menjelaskan bahwa password tidak dibuat otomatis.
- `src/app/admin/akses/page.tsx`
  - Menambahkan presentation authorization berdasarkan `authorize(...)` server-side.
  - Menampilkan panel **Buat pengguna manual** hanya bila capability tersedia.
  - Menampilkan kebutuhan autentikasi terbaru bila sesi sudah terlalu lama.
  - Menampilkan pesan sukses yang menegaskan tidak ada password, role, identity, atau sesi otomatis.
  - Menambahkan label audit `Pengguna manual dibuat`.
- `src/app/application.css`
  - Menambahkan style panel provisioning dan feedback sukses yang responsif.

### Regresi keamanan

- `src/modules/identity-access/mutations.test.ts`
  - Menambahkan mock `user.create` dan capability provisioning pada fixture actor.
  - Menambahkan test untuk:
    - capability khusus;
    - recent authentication;
    - reauthorization dalam transaksi;
    - normalisasi email/username;
    - tenant derivation dari principal;
    - tidak adanya password/role/identity/session otomatis;
    - audit provisioning;
    - duplicate unique constraint menjadi konflik aman.

### Dokumentasi

- `README.md`
  - Mendokumentasikan controlled provisioning dan larangan bootstrap/seed/direct SQL.
- `docs/adr/0002-identity-access-and-sessions.md`
  - Mencatat kebijakan manual provisioning sebagai keputusan P-10.
- `docs/runbooks/google-workspace-sso.md`
  - Menambahkan urutan provisioning sebelum explicit linking.
  - Memperbaiki kalimat rollback lama yang terkorupsi.

## Bukti validasi

### Test terfokus

Mutasi IAM lulus:

- **1 file test lulus**
- **39/39 test lulus**

### Foundation quality gate

Task `E-JLS: Verify foundation` / `npm.cmd run check` lulus setelah satu perbaikan lint React purity:

- Prisma Client generate: lulus
- ESLint: lulus
- TypeScript strict: lulus
- Vitest: **14/14 file**, **146/146 test** lulus
- Next.js `16.2.11` production build: lulus
- Worker esbuild: lulus

Masalah lint yang diperbaiki:

- `Date.now()` saat render di `src/app/admin/akses/page.tsx` ditolak aturan React purity.
- Perhitungan diganti dengan helper kebijakan `hasRecentAuthentication` dari `session-dal.ts`, sehingga UI dan backend memakai sumber aturan 15 menit yang sama.

## Status Docker/redeploy

Redeploy **selesai dan sehat**. Sebelum pulih, BuildKit sempat gagal dengan gRPC/EOF, pipe `dockerDesktopLinuxEngine` hilang, dan builder berstatus error. Proses Docker yang macet dihentikan tanpa reset data, lalu Docker Desktop berhasil dibuka kembali.

Setelah engine pulih:

1. Builder `default` dan `desktop-linux` kembali `running`.
2. Image `migrate`, `web`, `worker`, dan `nginx` berhasil dibangun ulang secara serial.
3. Migration `20260723120000_add_manual_user_provision_permission` berhasil diterapkan.
4. Container migration keluar dengan kode `0`.
5. Web, worker, dan Nginx direcreate dari image terbaru.
6. Database, Redis, web, worker, dan Nginx berstatus healthy.
7. `/nginx-health`, `/api/health/live`, dan `/api/health/ready` menghasilkan HTTP 200.
8. Readiness melaporkan PostgreSQL dan Redis `up`.
9. Hanya Nginx mempublikasikan host port `127.0.0.1:8080`.

Tidak ada volume, database, Redis data, file workspace, atau secret yang dihapus selama pemulihan.

## Hasil UAT lokal

### 1. Controlled provisioning — lulus

Identity admin membuat **I Gede Wira Dharma Naradha** (`naradha@smkn1klk.sch.id`) melalui UI resmi. Verifikasi read-only membuktikan:

- pengguna berstatus `ACTIVE` dengan `provisioningSource=MANUAL`;
- audit `iam.user.provisioned` berstatus `SUCCEEDED`;
- provisioning tidak membuat fallback credential, role assignment, Google identity, atau sesi secara otomatis.

### 2. Explicit Google linking dan login — happy path lulus

- Login Google sebelum linking ditolak generik dan tidak mengubah identity maupun akses.
- Identity admin memulai linking dari detail target, operator memverifikasi akun Google target, lalu mengonfirmasi link sekali pakai.
- Audit `iam.identity.google.linked` berstatus `SUCCEEDED`.
- Setelah logout Admin, target berhasil masuk melalui tombol Google Workspace.
- Audit `auth.google.succeeded` berstatus `SUCCEEDED` dan tepat satu sesi Google aktif terbentuk.
- Target tetap memiliki nol fallback credential dan nol role assignment aktif; halaman capability-neutral ditampilkan sehingga autentikasi tidak memberi otorisasi otomatis.

### 3. UAT yang masih harus dijalankan

1. Dari sesi Admin Akses yang berbeda, lepas identity Google target dengan alasan audit.
2. Pastikan sesi Google aktif target dicabut dan fallback target—bila kelak tersedia—tidak terpengaruh.
3. Pastikan login Google target setelah unlink ditolak generik.
4. Tautkan kembali identity target agar kondisi akhir tetap operasional.
5. Uji penolakan generik untuk pengguna `SUSPENDED` dan `DEACTIVATED` menggunakan fixture/akun UAT yang disetujui; jangan mengubah akun Admin utama.
6. Jalankan ulang seluruh alur pada staging HTTPS dan minta acceptance identity admin/pemilik proses.

Password, client secret, token, dan credential Google harus dimasukkan langsung oleh operator pada UI/terminal/secret manager, bukan melalui chat atau dokumen ini.

## Status todo saat sesi diperbarui

- [x] Pelajari pola provisioning IAM
- [x] Rancang mutasi pengguna aman
- [x] Implementasikan backend provisioning
- [x] Tambahkan UI provisioning admin
- [x] Tambahkan test regresi IAM
- [x] Validasi gate kualitas penuh
- [x] Deploy ulang runtime lokal
- [x] Dokumentasikan panduan UAT linking Google
- [x] Eksekusi happy-path provisioning/linking/login Google credentialed
- [ ] Eksekusi unlink/revocation, relink, dan negative-state UAT
- [ ] Eksekusi staging HTTPS dan acceptance stakeholder

## Gate yang masih terbuka

Implementasi dan test pass belum berarti Foundation diterima. Penutupan masih memerlukan:

- deployment dan evidence staging HTTPS;
- UAT P-10 dan Google SSO oleh pemilik proses/identity admin;
- review accessibility manual/independen;
- review keamanan independen;
- penerimaan stakeholder dan sign-off Foundation;
- ratifikasi keputusan Fase 0 yang memblokir Slice 1.

Modul jurnal/absensi belum boleh dimulai sebelum Foundation gate diterima sesuai instruksi workspace.
