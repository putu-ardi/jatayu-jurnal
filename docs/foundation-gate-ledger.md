# Foundation Gate Ledger

Dokumen ini merekam status implementasi child workspace secara objektif. Dokumen ini bukan persetujuan stakeholder, tidak mengubah dokumen Fase 0 di parent workspace, dan tidak meratifikasi keputusan produk yang masih berstatus usulan kerja.

**Snapshot:** 23 Juli 2026
**Gate:** Foundation / Slice 0
**Status keseluruhan:** **Belum diterima**

## Prinsip status

- **Terbukti lokal**: ada implementasi dan bukti verifikasi yang dapat diulang di workstation pengembangan.
- **Terbukti CI GitHub**: implementasi juga lulus pada runner GitHub-hosted yang ephemeral; status ini bukan bukti staging, UAT, atau penerimaan stakeholder.
- **Terimplementasi, belum diterima**: fungsi tersedia tetapi penerimaan stakeholder atau bukti lingkungan target belum ada.
- **Belum diimplementasikan**: requirement masih terbuka.
- **Diblokir keputusan/akses eksternal**: tidak boleh diselesaikan dengan asumsi implementor.

## Ledger

| Area | Status | Bukti saat ini | Kekurangan untuk menutup gate | Otoritas penutup |
| --- | --- | --- | --- | --- |
| Baseline aplikasi | Terbukti lokal dan CI GitHub | Next.js App Router, TypeScript strict, Tailwind, PostgreSQL/Prisma, Redis/BullMQ, web dan worker terpisah; `Foundation CI` run [#29889357788](https://github.com/putu-ardi/jatayu-jurnal/actions/runs/29889357788) lulus pada commit `1e6c209`; gate lokal terbaru kembali meluluskan lint, typecheck, 146/146 test, build web, dan build worker | Deployment, UAT, dan penerimaan lingkungan target belum dibuktikan | Tim engineering |
| Topologi Docker | Terbukti lokal dan CI GitHub | Nginx menjadi satu-satunya ingress publik; web, worker, PostgreSQL, Redis, migrasi, dan bootstrap bersifat privat; run GitHub mengikat ingress fixture hanya ke loopback dan lulus; deployment lokal terbaru hanya mempublikasikan `127.0.0.1:8080->8080/tcp` dari Nginx | Deployment dan observasi di staging target belum dibuktikan | DevOps/operator |
| Hardening container | Terbukti lokal dan CI GitHub | Image multi-stage, proses non-root, root filesystem read-only, `no-new-privileges`, capability drop; assertion otomatis lulus pada runner GitHub terisolasi dan seluruh enam container lokal memenuhi assertion yang sama | Penerimaan kebijakan platform target belum ada | DevOps/security |
| Boundary keamanan HTTP | Terbukti lokal sebagian | CSP baseline, anti-sniffing, anti-framing, referrer policy, dan permissions policy aktif pada artifact lokal terbaru; CAPTCHA dan boundary publik OIDC lulus audit tanpa membocorkan token/challenge | CSP masih memakai `unsafe-inline` untuk kompatibilitas Next.js dan perlu disposition security; HSTS hanya boleh dikonfigurasi/diverifikasi pada ingress HTTPS staging; review keamanan independen belum ada | Security + DevOps |
| Health/readiness | Terbukti lokal dan CI GitHub | Liveness independen dari dependency; fault rehearsal Redis melalui Nginx membuktikan readiness $200 \rightarrow 503 \rightarrow 200$ tanpa restart web pada runner GitHub; deployment lokal terbaru menghasilkan `/nginx-health`, `/api/health/live`, dan `/api/health/ready` HTTP 200 | Uji gangguan terjadwal di staging belum ada | DevOps/operator |
| Migrasi basis data | Terbukti lokal dan CI GitHub | Migrasi one-shot dan invariant PostgreSQL lulus pada runner GitHub; runbook backup, restore, forward-only migration, dan rollback staging telah ditulis; migration lokal terbaru `20260723120000_add_manual_user_provision_permission` diterapkan dan container `Exited (0)`; backup/restore lokal disposable lulus dengan agregat identik, invariant lulus, dan cleanup terverifikasi | Backup/restore dan rollback belum direhearsal pada staging target yang disetujui | DBA/operator |
| P-10 identitas dan akses | Terimplementasi, UAT lokal parsial | Session opaque, fallback tenant-qualified, RBAC deny-by-default, recent auth, audit, lockout, mutasi serializable, landing capability-aware, pagination 10/25/50/100; identity admin berhasil memprovisikan pengguna kedua tanpa credential/role/identity/session otomatis, menautkan Google secara eksplisit melalui `(issuer, subject)`, dan menyelesaikan login Google credentialed; audit mencatat provisioning, penolakan generik sebelum link, link sukses, dan login sukses; sesi Google aktif terbentuk sementara role tetap nol sehingga landing tetap capability-neutral | UAT unlink/revocation, suspended/deactivated denial, staging HTTPS, UAT pemilik proses, review keamanan, dan acceptance SSO belum selesai | Stakeholder + identity admin |
| Bootstrap admin | Terbukti lokal | Bootstrap profile-gated, secret tidak ditanam pada image/repository | Prosedur custody secret operasional belum disetujui | Security/operator |
| Isolasi tenant | Terbukti lokal | Query tenant-qualified, constraint/trigger konsistensi tenant, pengujian policy | Penetration test independen belum ada | Security/QA |
| Audit | Terbukti lokal | Audit append-only untuk login dan mutasi privilege | Kebijakan retensi, ekspor, dan akses auditor belum diratifikasi | Stakeholder/security |
| Periode akademik | Terimplementasi, belum diterima | Model periode akademik tersedia | Workflow aktivasi, penutupan, dan rollover historis belum diimplementasikan; `DEC-10` belum diratifikasi | Stakeholder akademik |
| Identitas sekolah/branding | Terimplementasi sebagian | Model revisi branding immutable tersedia | UI Admin, effective-date workflow, validasi aset, dan keputusan `DEC-12` belum ditutup | Stakeholder + Admin sekolah |
| Import master | Belum diimplementasikan | Belum ada pipeline import guru, siswa, kelas, mapel, jadwal | Template, validasi, dry-run, idempotensi, laporan error, dan acceptance data | Stakeholder data + engineering |
| Monitoring resource | Belum diimplementasikan | Health endpoint tersedia, meter CPU/RAM/disk belum ada | Sumber metrik, ambang, aksesibilitas, dan observability staging | DevOps + stakeholder |
| Statistik defensible | Belum diimplementasikan | Prinsip tanpa prestige ranking tercatat di requirement | Definisi denominator, minimum cohort, suppression, dan approval `DEC-04` belum ada | Stakeholder + data owner |
| Absensi pagi vs pelajaran | Diblokir keputusan | Requirement memisahkan dua domain | Sumber absensi eksternal dan tanggung jawab rekonsiliasi `DEC-04` belum diratifikasi | Stakeholder |
| Academic kernel | Belum diimplementasikan | Belum ada `TeachingAssignment`, `Schedule`, `Occurrence`, `Attendance`, atau `JournalEntry` | Foundation harus diterima dan `DEC-04`, `DEC-10`, `DEC-12` harus ditutup sebelum Slice 1 | Stakeholder + product owner |
| Browser acceptance | Terbukti lokal dan CI GitHub | Playwright Chromium serial melalui Nginx membuktikan anonymous/generic denial, P-10, pagination/detail, keyboard/mobile, principal netral, logout, serta guard console/page/request/5xx pada run GitHub; audit publik lokal terbaru di system Edge juga lulus tanpa console error, page error, request failure, atau HTTP error; operator menyelesaikan happy-path credentialed provisioning, explicit Google linking, dan login Google pada artifact lokal terbaru | Negative-path unlink/revocation dan suspended/deactivated belum selesai; suite credentialed belum diotomasi, belum dijalankan di staging, dan belum menjadi UAT stakeholder | QA/engineering |
| Accessibility | Terbukti lokal dan CI GitHub sebagian | Semantic form, focus-visible, skip link, reduced motion, dan evidence CI sebelumnya tetap tersedia; audit login publik lokal terbaru membuktikan target minimum 44px, toggle password mouse/Enter beserta `aria-pressed`, urutan/tab focus dan indikator fokus, tanpa overflow pada 1280px/320px, serta axe WCAG 2 A/AA tanpa violation maupun contrast-incomplete | Audit screen reader, zoom/reflow manual, focus appearance/contrast manual atau independen, state terautentikasi artifact terbaru, dan bukti staging belum tersedia | QA/accessibility reviewer |
| Governance | Diblokir keputusan | Register keputusan Fase 0 tetap utuh dan tidak dimodifikasi | `DEC-01`–`DEC-13` masih usulan kerja; tidak ada sign-off Foundation | Product owner/stakeholder |

## Bukti teknis lokal dan CI GitHub yang sudah pernah lulus

### Snapshot lokal 23 Juli 2026

- Next.js dan `eslint-config-next` dinaikkan dari `16.2.10` ke patch keamanan `16.2.11`; `package-lock.json` diperbarui.
- `npm run check` lulus: ESLint, TypeScript strict, 146/146 unit/integration tests pada 14 file, build Next.js `16.2.11`, dan build worker. Task VS Code Foundation menggunakan `npm.cmd` agar dapat diulang pada PowerShell Windows tanpa terhalang unsigned `npm.ps1`.
- Test terfokus controlled provisioning pada `mutations.test.ts` lulus 39/39; regresi mencakup capability khusus, recent auth, reauthorization transaction-time, tenant derivation, normalisasi identifier, no-auto-access, audit, dan konflik identifier generik.
- Audit dependency produksi dan lengkap sama-sama melaporkan nol vulnerability; override PostCSS `8.5.21` dan Sharp `0.35.0` tetap terpasang.
- Konfigurasi Compose valid; image `ejls-web:0.1.0`, `ejls-worker:0.1.0`, `ejls-migrate:0.1.0`, dan `ejls-nginx:0.1.0` dibangun ulang secara serial setelah pemulihan Docker Desktop/BuildKit; production build web dan worker lulus di dalam image build.
- Migration `20260723120000_add_manual_user_provision_permission` diterapkan melalui container one-shot dan selesai `Exited (0)`; verifikasi read-only mengonfirmasi permission `iam.users.provision` dan mapping role `admin-akses` tersedia.
- Identity admin memprovisikan `I Gede Wira Dharma Naradha` melalui UI resmi. Snapshot pasca-UAT membuktikan pengguna `ACTIVE` bersumber `MANUAL`, memiliki tepat satu identity `GOOGLE_WORKSPACE`, nol fallback credential, nol role assignment aktif, dan satu sesi Google aktif.
- Audit lokal merekam `iam.user.provisioned` sukses pada 06:18 UTC, penolakan generik login unlinked pada 06:24 UTC, `iam.identity.google.linked` sukses pada 06:33 UTC, serta `auth.google.succeeded` pada 06:37 UTC. Landing capability-neutral membuktikan login tidak memberikan role otomatis.
- Deployment pasca-rebuild sehat: database, Redis, web, worker, dan Nginx berstatus healthy; hanya Nginx mempublikasikan `127.0.0.1:8080->8080/tcp`.
- Probe melalui Nginx pada `127.0.0.1:8080` menghasilkan HTTP 200 untuk `/nginx-health`, `/api/health/live`, dan `/api/health/ready`; readiness melaporkan PostgreSQL serta Redis `up` dan versi aplikasi `0.1.0`.
- Login publik artifact terbaru berhasil dimuat dan menampilkan Google Workspace entry point, school code `school-main`, fallback form, CAPTCHA, dan build `0.1.0`; happy-path credentialed Google UAT kemudian lulus sebagaimana dicatat di atas.
- Boundary HTTP lokal terbaru lulus: `/login` HTTP 200 memuat metadata ikon, `/icon.svg` HTTP 200 `image/svg+xml`, dan response membawa CSP baseline `default-src 'self'`, pembatasan `base-uri`, `connect-src`, `font-src`, `form-action`, `frame-ancestors`, `img-src`, serta `object-src`. Directive script/style masih memakai `unsafe-inline` untuk kompatibilitas artifact Next.js dan tetap menjadi review item; HSTS tidak diklaim dari HTTP lokal.
- Audit CAPTCHA publik lulus berdasarkan kontrak source/runtime: response berisi hanya `id`, `imageUrl`, `prompt`, dan `expiresInSeconds`, menggunakan `Cache-Control: no-store`, dan tidak mengekspos jawaban. Audit boundary OIDC publik lulus untuk redirect ke origin Google, atribut cookie state, serta invalid callback yang kembali ke origin lokal terkonfigurasi; bukti ini bukan login Google end-to-end.
- Audit login publik headless system Edge lulus dengan guard fail-closed: tidak ada console/page/request/HTTP failure; seluruh target utama berukuran minimal 44px; school code `school-main` tampil; toggle password berubah `password → text → password` melalui mouse dan Enter dengan label/`aria-pressed` konsisten; indikator fokus tersedia; tidak ada overflow desktop 1280px maupun mobile 320px; axe WCAG 2 A/AA menghasilkan nol violation dan nol `color-contrast` incomplete. Favicon 404 awal diperbaiki dengan metadata icon aplikasi.
- Dalam scope project E-JLS, hanya Nginx memiliki host binding (`127.0.0.1:8080`); PostgreSQL, Redis, web, worker, dan migration tidak memiliki published host port.
- Assertion `docker inspect` membuktikan keenam container E-JLS berjalan non-root, read-only, `no-new-privileges`, `cap_drop: ALL`, dan tidak privileged.
- Rehearsal backup/restore lokal disposable `LOCAL-RESTORE-20260723120305` lulus: dump 73,685 byte dibuat dan di-hash, database `ejls_restore_20260723120305` dipulihkan, tujuh metrik agregat cocok dengan sumber, invariant database lulus, lalu target restore dan dump dihapus (`cleanup_database_exists=0`). Bukti ini hanya bukti lokal; target staging, backup platform, dan restore target staging belum tersedia.

### Bukti CI GitHub sebelumnya

- 67/67 unit/integration tests pada 8 file dan 3/3 browser evidence Playwright Chromium.
- ESLint, TypeScript, build web, dan build worker.
- Audit dependency lengkap dengan nol vulnerability pada snapshot CI tersebut; override PostCSS `8.5.21` dan Sharp `0.35.0` terpasang.
- Fresh Docker Compose build; migration one-shot `Exited (0)`; health ingress 200; hanya Nginx memiliki published port loopback pada fixture; seluruh container non-root, read-only, `no-new-privileges`, dan `cap_drop: ALL`.
- Invariant PostgreSQL pada transaksi rollback-only.
- Browser evidence anonymous/generic denial, P-10 pagination/detail, keyboard/mobile, principal netral, logout, dan runtime failure guards melalui Nginx.
- Axe WCAG 2 A/AA, termasuk guard fail-closed untuk contrast yang tidak dapat ditentukan, lulus pada login, P-10 desktop/mobile, dan workspace netral.
- Fault rehearsal Redis melalui Nginx membuktikan liveness tetap 200, readiness turun ke 503, lalu pulih ke 200 setelah Redis kembali tanpa restart web.
- `Foundation CI` run [#29889357788](https://github.com/putu-ardi/jatayu-jurnal/actions/runs/29889357788) lulus pada commit `1e6c209`: job quality 55 detik dan job Docker/database/browser/accessibility 2 menit 33 detik; total 3 menit 33 detik.
- Cleanup pasca-evidence terverifikasi: nol container/network/volume/image project dan nol artifact Playwright sementara.

Bukti di atas harus dijalankan ulang setelah perubahan berikutnya. Hasil lokal maupun GitHub CI tidak menggantikan staging evidence, UAT, review keamanan independen, atau sign-off stakeholder.

## Blocker keputusan sebelum Slice 1

1. **`DEC-04` — sumber dan batas domain absensi.** Harus menetapkan sumber absensi pagi, absensi pelajaran, rekonsiliasi, koreksi, serta pemilik datanya.
2. **`DEC-10` — rollover tahun ajaran.** Harus menetapkan snapshot historis, carry-forward master, status periode, rollback, dan batas mutasi data lama.
3. **`DEC-12` — branding efektif.** Harus menetapkan siapa yang menerbitkan, kapan revisi berlaku, validasi aset, fallback, dan perilaku pada dokumen historis.
4. **Foundation acceptance.** Product owner dan stakeholder terkait harus menutup gate secara eksplisit; implementasi tidak boleh menyimpulkan penerimaan dari test pass.

## Urutan penutupan yang disarankan

1. Pertahankan bukti run `Foundation CI` yang lulus dan jalankan ulang pada commit berikutnya; jangan menyamakan CI dengan staging atau penerimaan stakeholder.
2. Selesaikan sisa UAT P-10 lokal: unlink/revocation, penolakan suspended/deactivated, dan relink agar kondisi akhir tetap operasional.
3. Jalankan staging runbook yang sudah tersedia: migration, readiness failure/recovery, backup/restore, secret custody, observability, dan cleanup.
4. Selesaikan UAT pemilik proses, accessibility review manual/independen, dan security review.
5. Ratifikasi keputusan Fase 0 yang memblokir domain.
6. Catat sign-off Foundation dengan nama peran, tanggal, versi artifact, dan pengecualian yang disetujui.
7. Baru mulai Slice 1 academic kernel; jangan memulai journal/attendance sebagai shortcut.

## Aturan perubahan status

Status **Belum diterima** hanya boleh diubah setelah bukti teknis terbaru dilampirkan dan pemilik otoritas pada baris terkait memberikan persetujuan eksplisit. Dokumen ini tidak boleh digunakan untuk menandatangani atas nama stakeholder.