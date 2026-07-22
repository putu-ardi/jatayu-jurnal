# Foundation Gate Ledger

Dokumen ini merekam status implementasi child workspace secara objektif. Dokumen ini bukan persetujuan stakeholder, tidak mengubah dokumen Fase 0 di parent workspace, dan tidak meratifikasi keputusan produk yang masih berstatus usulan kerja.

**Snapshot:** 22 Juli 2026  
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
| Baseline aplikasi | Terbukti CI GitHub | Next.js App Router, TypeScript strict, Tailwind, PostgreSQL/Prisma, Redis/BullMQ, web dan worker terpisah; `Foundation CI` run [#29889357788](https://github.com/putu-ardi/jatayu-jurnal/actions/runs/29889357788) lulus pada commit `1e6c209` | Deployment, UAT, dan penerimaan lingkungan target belum dibuktikan | Tim engineering |
| Topologi Docker | Terbukti CI GitHub | Nginx menjadi satu-satunya ingress publik; web, worker, PostgreSQL, Redis, migrasi, dan bootstrap bersifat privat; run GitHub mengikat ingress fixture hanya ke loopback dan lulus | Deployment dan observasi di staging target belum dibuktikan | DevOps/operator |
| Hardening container | Terbukti CI GitHub | Image multi-stage, proses non-root, root filesystem read-only, `no-new-privileges`, capability drop; assertion otomatis lulus pada runner GitHub terisolasi | Penerimaan kebijakan platform target belum ada | DevOps/security |
| Health/readiness | Terbukti CI GitHub | Liveness independen dari dependency; fault rehearsal Redis melalui Nginx membuktikan readiness $200 \rightarrow 503 \rightarrow 200$ tanpa restart web pada runner GitHub | Uji gangguan terjadwal di staging belum ada | DevOps/operator |
| Migrasi basis data | Terbukti CI GitHub | Migrasi one-shot dan invariant PostgreSQL lulus pada runner GitHub; runbook backup, restore, forward-only migration, dan rollback staging telah ditulis | Backup/restore dan rollback belum direhearsal pada staging | DBA/operator |
| P-10 identitas dan akses | Terimplementasi, belum diterima | Session opaque, fallback tenant-qualified, RBAC deny-by-default, recent auth, audit, lockout, mutasi serializable, landing capability-aware, pagination 10/25/50/100 | GWfE/SSO nyata dan UAT pemilik proses belum tersedia | Stakeholder + identity admin |
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
| Browser acceptance | Terbukti CI GitHub | Playwright Chromium serial melalui Nginx membuktikan anonymous/generic denial, P-10, pagination/detail, keyboard/mobile, principal netral, logout, serta guard console/page/request/5xx; fixture ephemeral dan guard database/tenant/state lulus pada run GitHub | Belum dijalankan di staging dan belum menjadi UAT stakeholder | QA/engineering |
| Accessibility | Terbukti CI GitHub sebagian | Semantic form, focus-visible, skip link, reduced motion, target minimum 44px, keyboard focus, mobile overflow, serta axe WCAG 2 A/AA dan contrast fail-closed lulus pada tiga state browser utama di GitHub CI | Audit screen reader, zoom/reflow, focus appearance, contrast manual/independen, dan bukti staging belum tersedia | QA/accessibility reviewer |
| Governance | Diblokir keputusan | Register keputusan Fase 0 tetap utuh dan tidak dimodifikasi | `DEC-01`–`DEC-13` masih usulan kerja; tidak ada sign-off Foundation | Product owner/stakeholder |

## Bukti teknis lokal dan CI GitHub yang sudah pernah lulus

- 67/67 unit/integration tests pada 8 file dan 3/3 browser evidence Playwright Chromium.
- ESLint, TypeScript, build web, dan build worker.
- Audit dependency lengkap dengan nol vulnerability pada snapshot validasi; override PostCSS `8.5.21` dan Sharp `0.35.0` terpasang.
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
2. Jalankan staging runbook yang sudah tersedia: migration, readiness failure/recovery, backup/restore, secret custody, observability, dan cleanup.
3. Selesaikan UAT P-10, accessibility review manual/independen, dan security review.
4. Ratifikasi keputusan Fase 0 yang memblokir domain.
5. Catat sign-off Foundation dengan nama peran, tanggal, versi artifact, dan pengecualian yang disetujui.
6. Baru mulai Slice 1 academic kernel; jangan memulai journal/attendance sebagai shortcut.

## Aturan perubahan status

Status **Belum diterima** hanya boleh diubah setelah bukti teknis terbaru dilampirkan dan pemilik otoritas pada baris terkait memberikan persetujuan eksplisit. Dokumen ini tidak boleh digunakan untuk menandatangani atas nama stakeholder.