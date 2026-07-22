# E-JLS — Fondasi Produksi dan Identity & Access

Workspace produksi untuk Elektronik Jurnal dan Laboratorium Sekolah (E-JLS) SMK Jatayu. Fondasi Docker dan modul P-10 Identity & Access telah tersedia: login fallback tenant-qualified, sesi yang dapat dicabut, policy capability/scope/grant-boundary, manajemen pengguna, dan audit privilege. Login Google Workspace belum dikonfigurasi dan tidak ditampilkan sebagai opsi aktif.

Jurnal, absensi, statistik, dan workflow bisnis lain belum diimplementasikan. Dokumen PRD, perancangan, discovery, backlog, design system, dan prototipe Fase 0 tetap berada di folder induk dan tidak boleh diubah dari workspace produksi ini. Status implementasi ini tidak menyatakan persetujuan stakeholder atas keputusan produk yang masih terbuka. Lihat `docs/foundation-gate-ledger.md` untuk bukti, blocker, otoritas penutup, dan status Foundation **Belum diterima**.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, dan Tailwind CSS 4.
- PostgreSQL 17 melalui Prisma 7 dan adapter PostgreSQL.
- Redis 8 dan worker BullMQ terpisah.
- Nginx unprivileged sebagai satu-satunya ingress publik.
- Vitest untuk unit test, Playwright Chromium dan axe-core untuk browser/accessibility evidence, serta ESLint untuk static analysis.
- Docker Compose sebagai jalur runtime produksi-lokal yang utama.
- GitHub Actions untuk quality gate serta evidence Docker/database/browser/accessibility yang terisolasi.

Keputusan arsitektur dicatat di `docs/adr/0001-foundation-stack.md`. Rehearsal deployment target mengikuti `docs/runbooks/staging-foundation.md`; runbook tersedia, tetapi belum membuktikan bahwa staging telah dijalankan.

## Topologi runtime

```text
Host :HTTP_PORT
      │
      ▼
Nginx (ingress network)
      │
      ▼
Next.js web ─────────────┐
      │                  │
      └── backend ───────┼── PostgreSQL
                         ├── Redis
BullMQ worker ───────────┘

one-shot migrate ── PostgreSQL
profile bootstrap ─ PostgreSQL
```

Hanya Nginx menggunakan `ports`. Web, worker, PostgreSQL, Redis, migration, dan bootstrap tidak memiliki port host. Jaringan `backend` bersifat internal.

## Prasyarat

- Docker dengan dukungan Compose v2.
- Untuk pengembangan tanpa container: Node.js 24+ dan npm 11+.

Versi image dikunci di Dockerfile dan `compose.yaml`; jangan menggantinya dengan tag `latest`.

## Menjalankan dengan Docker

1. Salin `.env.example` menjadi `.env`.
2. Ganti `POSTGRES_PASSWORD` dan `REDIS_PASSWORD` dengan secret panjang yang berbeda dan URL-safe.
3. Pertahankan `HTTP_BIND_ADDRESS=127.0.0.1` untuk workstation lokal. Ubah binding hanya bila ingress memang harus dapat dicapai dari interface lain dan kontrol jaringan/TLS sudah tersedia.
4. Jalankan `docker compose up --build --detach --wait`.
5. Buka `http://localhost:8080` atau port yang ditetapkan melalui `HTTP_PORT`.
6. Periksa status dengan `docker compose ps --all`.

Compose menunggu PostgreSQL sehat, menjalankan migrasi satu kali, lalu menyalakan web, worker, dan Nginx sesuai dependency health. Container `migrate` berstatus `Exited (0)` adalah kondisi normal.

### Bootstrap administrator akses pertama

Deployment database baru belum memiliki akun masuk. Jalankan bootstrap satu kali setelah migrasi dan sebelum aplikasi diserahkan kepada operator:

1. Pastikan stack sudah menjalankan migration dengan sukses.
2. Siapkan nilai `EJLS_BOOTSTRAP_SCHOOL_CODE`, `EJLS_BOOTSTRAP_SCHOOL_NAME`, `EJLS_BOOTSTRAP_ADMIN_EMAIL`, `EJLS_BOOTSTRAP_ADMIN_NAME`, dan password sementara yang memenuhi kebijakan.
3. Jalankan service profile `bootstrap` dengan `EJLS_BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN`. Pada `NODE_ENV=production`, sertakan `EJLS_BOOTSTRAP_ALLOW_PRODUCTION=I_UNDERSTAND`.
4. Masukkan password melalui mekanisme environment sementara platform atau prompt terminal lokal; jangan simpan password bootstrap dalam file yang dikomit atau command history.
5. Pastikan service keluar dengan kode `0`, login melalui Nginx, ganti/rotasi password sesuai prosedur sekolah, lalu hapus seluruh environment bootstrap dari platform.

Contoh PowerShell lokal yang tidak menulis password ke command history:

```powershell
$env:EJLS_BOOTSTRAP_CONFIRM = "CREATE_FIRST_ADMIN"
$env:EJLS_BOOTSTRAP_ALLOW_PRODUCTION = "I_UNDERSTAND"
$env:EJLS_BOOTSTRAP_SCHOOL_CODE = "kode-sekolah"
$env:EJLS_BOOTSTRAP_SCHOOL_NAME = "Nama Sekolah"
$env:EJLS_BOOTSTRAP_ADMIN_EMAIL = "admin@example.sch.id"
$env:EJLS_BOOTSTRAP_ADMIN_NAME = "Admin Akses"
$securePassword = Read-Host "Password bootstrap" -AsSecureString
$env:EJLS_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
docker compose --profile bootstrap run --rm bootstrap
Remove-Item Env:EJLS_BOOTSTRAP_*
```

Bootstrap memakai advisory lock dan transaction serializable, lalu menolak eksekusi bila penugasan akses apa pun sudah ada. Proses membuat katalog role/permission, sekolah, admin fallback, role Admin Akses beserta grant boundary, dan audit event tanpa mencetak password. Eksekusi kedua harus gagal; jangan mencoba mengakalinya dengan menghapus penugasan produksi.

### Menghentikan dan membersihkan stack

- `docker compose down` menghentikan service tanpa menghapus data.
- `docker compose down --volumes` juga menghapus PostgreSQL dan Redis; gunakan hanya untuk fixture/local smoke test atau setelah backup yang terverifikasi.
- Setelah bootstrap, hapus container one-shot dengan opsi `--rm` dan bersihkan environment sementara.
- Audit bersifat append-only. Kebijakan retensi, backup/restore, rotasi secret, session purge, dan BullMQ cleanup harus ditetapkan dalam runbook deployment sebelum produksi sebenarnya.

## Environment

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `POSTGRES_DB` | Ya | Nama database PostgreSQL. |
| `POSTGRES_USER` | Ya | User aplikasi PostgreSQL. |
| `POSTGRES_PASSWORD` | Ya | Password database URL-safe; jangan commit nilai asli. |
| `REDIS_PASSWORD` | Ya | Password Redis URL-safe; jangan commit nilai asli. |
| `HTTP_BIND_ADDRESS` | Tidak | Alamat host untuk binding Nginx; contoh lokal memakai `127.0.0.1`, sedangkan default Compose `0.0.0.0`. |
| `HTTP_PORT` | Tidak | Port host Nginx, default `8080`. |
| `APP_VERSION` | Tidak | Versi yang dilaporkan readiness, default `0.1.0`. |
| `HEALTH_CHECK_TIMEOUT_MS` | Tidak | Batas health dependency, default `3000`, rentang 250–10000 ms. |
| `DATABASE_URL` | npm lokal | URL Prisma saat command dijalankan di luar Compose. |
| `REDIS_URL` | npm lokal | URL Redis saat worker/web dijalankan di luar Compose. |
| `EJLS_BOOTSTRAP_CONFIRM` | Bootstrap | Harus tepat `CREATE_FIRST_ADMIN`. |
| `EJLS_BOOTSTRAP_ALLOW_PRODUCTION` | Bootstrap produksi | Harus tepat `I_UNDERSTAND`. |
| `EJLS_BOOTSTRAP_SCHOOL_CODE` | Bootstrap | Kode tenant 2–32 karakter alfanumerik/tanda hubung; dinormalisasi lowercase. |
| `EJLS_BOOTSTRAP_SCHOOL_NAME` | Bootstrap | Nama sekolah 3–120 karakter. |
| `EJLS_BOOTSTRAP_TIMEZONE` | Tidak | Zona waktu sekolah, default `Asia/Jakarta`. |
| `EJLS_BOOTSTRAP_ADMIN_EMAIL` | Bootstrap | Email admin pertama; dinormalisasi lowercase. |
| `EJLS_BOOTSTRAP_ADMIN_NAME` | Bootstrap | Nama lengkap admin pertama. |
| `EJLS_BOOTSTRAP_PASSWORD` | Bootstrap | Secret sementara 12–72 byte bcrypt dengan huruf kecil/besar, angka, dan simbol. |

File `.env` diabaikan Git. `.env.example` hanya berisi placeholder pengembangan. Variabel bootstrap sengaja tidak diberi nilai contoh password; gunakan environment sementara atau secret injection platform. URL loopback pada `.env.example` hanya bekerja bila PostgreSQL/Redis memang tersedia di host—service Compose tidak memublikasikan port tersebut.

## Health endpoint

- `GET /api/health/live` memeriksa proses web tanpa menyentuh dependency dan digunakan oleh healthcheck container web.
- `GET /api/health/ready` memeriksa PostgreSQL dan Redis dengan timeout terbatas. Endpoint dapat mengembalikan 503 sementara web tetap healthy, lalu pulih ke 200 setelah dependency tersedia kembali tanpa restart web.
- `GET /nginx-health` adalah probe publik non-sensitif untuk healthcheck container Nginx.
- Worker memperbarui heartbeat `/tmp/worker-ready`; saat ini probe tersebut membuktikan process loop masih hidup, bukan readiness Redis secara berkelanjutan.

Readiness hanya mengembalikan status `up`/`down` dan tidak mengekspos exception, connection string, atau secret.

## Identity, access, dan sesi

- Login fallback selalu membutuhkan kode sekolah dan email; pesan gagal sama untuk school/user/password/status/lock mismatch.
- Landing setelah login mengikuti capability yang sudah diimplementasikan: principal P-10 diarahkan ke `/admin/akses`, sedangkan principal valid tanpa P-10 tetap pada workspace netral dan tidak diberi tautan Admin palsu.
- Direktori pengguna P-10 menyediakan page size allowlist 10/25/50/100 (default 25); filter, halaman, page size, dan detail terpilih dipertahankan secara aman pada navigasi yang relevan.
- Password fallback di-hash bcrypt cost 12, maksimal 72 byte, minimal 12 karakter, dan wajib memuat huruf kecil, huruf besar, angka, serta simbol.
- Lima kegagalan fallback mengunci credential selama 15 menit. Counter dinaikkan secara atomik agar upaya paralel tidak hilang. Login sukses mengunci dan memvalidasi ulang status user/credential sebelum session diterbitkan; race menghasilkan kegagalan generik tanpa cookie. Nginx juga membatasi POST `/login` per IP menjadi 5 request/menit dengan burst 4 dan respons 429.
- Limiter Nginx berbasis IP dan state lokal proses; evaluasi kembali trusted proxy/real-IP bila ingress berada di belakang load balancer. Jangan menjalankan web sebagai ingress publik langsung.
- Token sesi opaque 32-byte hanya disimpan sebagai SHA-256 di database. Cookie `HttpOnly`, `SameSite=Lax`, `Priority=High`, dan `Secure` pada production.
- Sesi berlaku tetap 8 jam. Mutasi berisiko memerlukan autentikasi dalam 15 menit terakhir.
- Policy deny-by-default memerlukan assignment aktif, capability, tenant/scope containment, dan grant boundary. Scope selain `SCHOOL` hanya mengandung target dengan tipe+reference yang sama; belum ada pewarisan `PROGRAM` ke `CLASS`.
- Setiap mutasi privilege mengunci lalu memuat ulang session, status user, assignment, capability, dan grant boundary actor di dalam transaction `Serializable`; authorization dari awal request hanya dipakai sebagai fail-fast. Revoke atau perubahan policy konkuren harus selesai lebih dulu atau menghasilkan conflict aman.
- Self-elevation, perubahan lifecycle sendiri, dan perubahan fallback sendiri ditolak. Mencabut sesi sendiri tetap diperbolehkan bila actor memiliki capability.
- Suspend/deactivate mencabut seluruh sesi aktif. Mutasi berversi menggunakan optimistic concurrency; serialization, deadlock, unique, dan exclusion conflict dipetakan menjadi konflik aman yang meminta operator memuat ulang.
- PostgreSQL menolak active role assignment dengan tenant/user/role/scope dan rentang efektif yang overlap, termasuk pada grant konkuren. Kode sekolah dan email tenant juga unik secara case-insensitive.
- Audit actor dan subject dipisahkan, metadata diredaksi, dan tabel audit append-only di database.
- Model identitas Google Workspace tersedia untuk fondasi data, tetapi login Google belum dikonfigurasi.

## Pengembangan lokal

Instal dependency dari lockfile dengan `npm ci`. Sediakan `DATABASE_URL` dan `REDIS_URL` untuk proses yang dijalankan di luar Compose.

| Command | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan Next.js development server. |
| `npm run worker:dev` | Menjalankan worker dalam watch mode. |
| `npm run prisma:generate` | Menghasilkan Prisma Client. |
| `npm run db:migrate` | Membuat/menerapkan migration pada development saja. |
| `npm run db:deploy` | Menerapkan migration yang sudah dikomit. |
| `npm run check` | Lint, type-check, unit test, dan build produksi. |
| `npm run worker:build` | Membuat bundle worker CommonJS. |
| `npm run test:browser` | Menjalankan browser evidence Playwright secara serial melalui Nginx. |

Gunakan `npm run db:migrate -- --name <nama>` hanya saat perubahan schema domain sudah disetujui. Deployment selalu menggunakan `db:deploy`; jangan menjalankan migration development pada produksi.

Verifikasi invariant PostgreSQL pada database development/fixture yang telah dimigrasi dengan menyalurkan `scripts/verify-database-invariants.sql` ke `psql`. Script memakai fixture UUID tetap di dalam transaction dan selalu `ROLLBACK`; script menolak tenant silang, scope/range/token/version invalid, duplicate identity/assignment, mutasi audit, dan mutasi branding terbit. Jangan menjalankannya pada database yang mungkin memakai UUID fixture tersebut.

### Browser evidence pada fixture ephemeral

Suite Chromium memeriksa login anonim/gagal generik, target interaksi 44px dan focus indicator, landing P-10, pagination 10 baris, preservasi parameter detail, shell mobile tanpa overflow, workspace netral untuk principal non-P-10, logout, console/page error, request failure non-abort, dan respons 5xx. Setiap state utama juga dipindai dengan axe terhadap tag WCAG 2 A/AA, termasuk penolakan fail-closed bila `color-contrast` tidak dapat ditentukan. Otomasi axe tidak menggantikan audit screen reader, zoom/reflow, focus appearance, atau review contrast independen. Browser hanya mengakses Nginx; PostgreSQL dan Redis tetap privat.

Gunakan hanya stack Compose baru dengan nama database berakhiran `_browser_test`; seluruh volumenya harus boleh dihapus. Setelah migration sukses, jalankan bootstrap pertama dengan kode sekolah berawalan `e2e-`, lalu jalankan `bootstrap` sebagai one-shot dengan command `npm run seed:browser-test`, `NODE_ENV=test`, dan environment berikut:

- `EJLS_E2E_CONFIRM=SEED_EPHEMERAL_BROWSER_TEST`;
- `EJLS_E2E_SCHOOL_CODE` sama dengan kode bootstrap;
- `EJLS_E2E_MEMBER_EMAIL` pada domain `@example.test`;
- `EJLS_E2E_MEMBER_NAME` dan `EJLS_E2E_MEMBER_PASSWORD` valid.

Dengan seluruh environment tersebut sudah tersedia sementara pada shell, jalankan:

```powershell
docker compose --profile bootstrap run --rm --no-deps `
  -e NODE_ENV=test `
  -e EJLS_E2E_CONFIRM `
  -e EJLS_E2E_SCHOOL_CODE `
  -e EJLS_E2E_MEMBER_EMAIL `
  -e EJLS_E2E_MEMBER_NAME `
  -e EJLS_E2E_MEMBER_PASSWORD `
  bootstrap npm run seed:browser-test
```

Seed menolak host database selain service privat `database`, nama database non-test, tenant tidak tepat satu, atau state yang bukan tepat satu user dan satu assignment hasil bootstrap pertama. Seed membuat satu principal guru netral dan 34 user directory; jangan pernah menjalankannya pada data yang perlu dipertahankan.

Instal browser satu kali dengan `npx playwright install chromium`. Isi `E2E_BASE_URL` dengan URL Nginx fixture, lalu isi `E2E_SCHOOL_CODE`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_MEMBER_EMAIL`, dan `E2E_MEMBER_PASSWORD` melalui environment sementara sebelum menjalankan `npm run test:browser`. Jangan menulis password fixture ke repository, file laporan, atau command history. Setelah bukti selesai, hapus laporan Playwright, bersihkan environment sementara, dan jalankan `docker compose down --volumes --remove-orphans` hanya pada project fixture tersebut.

### Foundation CI

Workflow `Foundation CI` menjalankan dua job berurutan pada Ubuntu 24.04 dan Node.js 24.16.0:

1. install dari lockfile, lint, type-check, 67 unit/integration tests, build web/worker, serta audit dependency production dan lengkap;
2. project Compose ephemeral unik dengan credential acak, binding Nginx loopback-only, build/start/migration, assertion hardening, invariant PostgreSQL rollback-only, bootstrap/seed, Playwright+axe, anti-reseed, scan log runtime, dan fault rehearsal Redis $200 \rightarrow 503 \rightarrow 200$.

Runner selalu mencoba cleanup melalui trap dan mengunggah diagnostic hanya pada kegagalan dengan retensi tujuh hari. Script sengaja menolak eksekusi tanpa `GITHUB_ACTIONS=true` serta ID/attempt numerik; simulasi lokal hanya untuk engineering terkontrol dan harus memakai ID unik. Tersedianya workflow tidak berarti workflow GitHub atau staging sudah dijalankan—rujuk ledger untuk status bukti aktual.

## Struktur penting

- `src/app`: route, halaman, Server Action, dan health endpoint Next.js.
- `src/lib`: environment, database, Redis, queue, dan primitive health.
- `src/worker`: proses BullMQ terpisah.
- `src/modules/identity-access`: authentication, session DAL, policy, mutasi P-10, dan katalog role/capability.
- `src/modules/audit`: pencatatan audit dengan redaction terpusat.
- `prisma`: schema dan migration IAM/akademik/branding terkontrol.
- `nginx`: konfigurasi reverse proxy.
- `docs/adr`: keputusan arsitektur.

Generated Prisma Client dan bundle worker tidak dikomit; keduanya dibuat oleh proses build.

## Gate kualitas

Jalankan `npm ci`, `npm run check`, dan `npm audit` sebelum perubahan digabungkan. Untuk container, jalankan `docker compose config --quiet`, `docker compose build`, lalu `docker compose up --detach --wait`.

Setelah stack hidup, pastikan:

- container migrasi keluar dengan kode `0`;
- semua service runtime berstatus sehat;
- liveness dan readiness melalui Nginx mengembalikan HTTP 200;
- hanya Nginx yang memiliki `PublishedPort`;
- semua service berjalan non-root, menggunakan root filesystem read-only, `no-new-privileges`, dan `cap_drop: ALL`.

Package override mengunci PostCSS `8.5.21` karena Next.js 16.2.10 membawa versi terdampak CVE-2026-41305, serta Sharp `0.35.0` karena graph Next.js sebelumnya membawa versi terdampak GHSA-f88m-g3jw-g9cj. Hapus override hanya setelah versi Next.js terverifikasi membawa dependency terpatch dan `npm audit` tetap nol.

## Baseline keamanan

- Image aplikasi multi-stage dan runtime non-root.
- Seluruh root filesystem container read-only; direktori sementara memakai `tmpfs` terbatas.
- Semua Linux capability dijatuhkan dan privilege escalation dinonaktifkan.
- Database dan queue tidak dipublikasikan ke host.
- Log container dirotasi.
- Security header diberikan oleh Next.js; Nginx membatasi request umum dan memiliki bucket khusus POST `/login`.
- Nginx mempertahankan host authority (`Host`/`X-Forwarded-Host`) agar validasi origin Server Action tetap aktif di balik proxy.
- Policy IAM, tenant-qualified lookup, session revocation, recent authentication, optimistic version, dan constraint/trigger PostgreSQL berlapis; backend tetap menjadi otoritas walaupun UI menyembunyikan aksi terlarang.
- Tidak ada Docker socket, privileged mode, atau secret yang dibake ke image.

Untuk production sebenarnya, kelola secret melalui secret manager/platform deployment, terminasi TLS di ingress, pin image dengan digest, backup volume terenkripsi, dan aktifkan monitoring eksternal. Jangan mengekspos metrics secara publik.

## Troubleshooting

- **Compose menolak variabel:** pastikan `.env` tersedia dan empat variabel PostgreSQL/Redis terisi.
- **Readiness 503:** lihat `docker compose ps` lalu log database/Redis; respons endpoint sengaja tidak menampilkan detail internal.
- **Migrasi gagal:** lihat `docker compose logs migrate database`; jangan memaksa web berjalan sebelum migration sukses.
- **Port sudah digunakan:** ubah `HTTP_PORT` di `.env`.
- **Worker unhealthy:** periksa `docker compose logs worker redis`; heartbeat membutuhkan koneksi Redis aktif.
- **Perubahan dependency tidak masuk image:** jalankan ulang build.

## Batas Fase 1

Schema Prisma saat ini sengaja belum memiliki model bisnis. Implementasi domain berikutnya harus tetap mengikuti PRD v2.2 dan artefak Fase 0 di folder induk, dimulai dari identity/access, kalender akademik, konfigurasi brand, dan auditability sebelum alur jurnal/absensi.
