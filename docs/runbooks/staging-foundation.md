# Runbook Rehearsal Foundation di Staging

## Tujuan dan batas

Runbook ini mengarahkan rehearsal teknis Foundation E-JLS pada lingkungan staging yang terisolasi. Hasilnya dapat menjadi bukti staging, tetapi **tidak** otomatis menerima Foundation, menggantikan UAT, atau memberikan persetujuan atas keputusan produk.

Runbook ini hanya mencakup deployment Foundation, migrasi, health/readiness, backup/restore, custody secret, observability, rollback operasional, dan cleanup. Jangan menggunakannya untuk mengaktifkan jurnal, absensi, statistik, import master, atau model bisnis lain sebelum gate Foundation diterima.

## Peran minimum

| Peran | Tanggung jawab |
| --- | --- |
| Release operator | Menjalankan deployment, mencatat digest, dan menghentikan rehearsal bila guard gagal. |
| DBA/operator data | Menyetujui backup, restore ke target disposable, dan pemeriksaan integritas. |
| Security/operator secret | Menyediakan secret melalui secret manager dan membuktikan rotasi/penghapusan tanpa membuka nilainya. |
| QA | Menjalankan smoke/browser evidence dan menyimpan hasil tanpa credential. |
| Approver environment | Menyetujui jendela rehearsal dan target staging yang benar. |

Satu orang dapat memegang lebih dari satu peran pada tim kecil, tetapi approval, pelaksana, waktu, dan hasil tetap harus dicatat terpisah.

## Larangan keras

- Jangan menjalankan `prisma migrate dev`, bootstrap browser, atau seed E2E pada database staging persisten.
- Jangan menjalankan `docker compose down --volumes` pada staging persisten.
- Jangan menyalin credential produksi ke staging, pull request, artifact, log, atau command history.
- Jangan memublikasikan PostgreSQL, Redis, web, worker, migration, bootstrap, atau endpoint metrics ke jaringan publik. Nginx adalah satu-satunya ingress.
- Jangan melanjutkan migrasi bila backup belum terverifikasi, image tidak dapat diidentifikasi dengan digest, atau target environment ambigu.
- Jangan mengubah status Foundation menjadi diterima hanya karena langkah teknis lulus.

## Prasyarat dan guard sebelum perubahan

1. Catat change/rehearsal ID, tanggal, operator, approver, target cluster/host, namespace/project, DNS, dan jendela perubahan.
2. Verifikasi secara independen bahwa target berlabel `staging` dan bukan production. Gunakan guard deployment platform yang gagal tertutup bila label tidak sesuai.
3. Pastikan branch/commit yang diuji telah lulus workflow `Foundation CI` pada commit yang sama.
4. Rekam commit SHA, nomor workflow run, digest image web/worker/migrate/bootstrap/Nginx, versi schema migration terakhir, dan checksum manifest deployment.
5. Pastikan seluruh image immutable dan direferensikan dengan digest, bukan tag mutable atau `latest`.
6. Pastikan PostgreSQL dan Redis hanya berada pada network privat. Hanya ingress TLS staging yang boleh dipublikasikan.
7. Pastikan kapasitas disk cukup untuk data aktif, backup, restore disposable, log, dan ruang sementara migrasi.
8. Setujui titik batal, pemilik keputusan rollback, batas waktu migrasi, dan jalur eskalasi sebelum deployment.
9. Sediakan target restore **disposable** yang berbeda dari database staging aktif.

Jika salah satu guard gagal, hentikan rehearsal dan catat `BLOCKED`; jangan mengubah manifest untuk melewati guard.

## Custody dan rotasi secret

Secret minimum adalah credential PostgreSQL, credential Redis, dan bila database baru, credential bootstrap administrator sementara.

1. Buat secret unik staging di secret manager/platform; jangan gunakan file `.env` yang dikomit.
2. Batasi akses secret ke service account deployment dan operator yang disetujui. Aktifkan audit akses secret.
3. Inject secret pada runtime. Pastikan image, labels, arguments, health response, dan log tidak memuat nilainya.
4. Untuk bootstrap database baru, gunakan mekanisme one-shot, confirmation phrase yang diwajibkan aplikasi, dan identity staging yang disetujui. Hapus environment bootstrap segera setelah exit code `0`.
5. Rotasi password bootstrap pada first login sesuai prosedur identity admin. Jangan menyimpan password sementara pada evidence.
6. Buktikan rotasi credential service satu per satu pada rehearsal terjadwal. Setelah tiap rotasi, verifikasi readiness pulih dan credential lama ditolak.
7. Evidence hanya boleh menyebut secret ID/version, waktu rotasi, actor role, serta hasil; tidak boleh menyimpan nilai atau token.

## Backup sebelum migrasi

Gunakan fasilitas backup konsisten milik platform PostgreSQL. Command spesifik provider harus ditulis dan direview operator di change record, bukan di-hardcode pada repository ini.

1. Ambil backup konsisten sebelum deployment dan catat backup ID, timestamp, retention, encryption/key reference, ukuran, serta checksum bila tersedia.
2. Pastikan backup selesai sukses dan dapat dibaca oleh restore service account.
3. Catat recovery point objective aktual dari backup/WAL yang tersedia.
4. Jangan menganggap backup valid hanya dari status “completed”; lanjutkan ke restore rehearsal disposable.

## Restore rehearsal disposable

1. Provision database disposable pada network privat dengan versi PostgreSQL yang sama.
2. Restore backup terbaru ke target tersebut menggunakan service account staging.
3. Terapkan guard agar aplikasi staging aktif tidak dapat menunjuk ke target disposable selama restore.
4. Verifikasi koneksi, migration history, jumlah tenant/user/assignment/audit secara agregat, constraint penting, dan checksum/indikator platform yang disetujui DBA. Jangan ekspor data personal ke artifact.
5. Catat waktu restore, ukuran, recovery point, hasil integritas, dan gap terhadap RTO/RPO.
6. Hapus target disposable hanya setelah DBA menyetujui evidence. Gunakan identitas resource yang tepat; jangan memakai wildcard cleanup.

Restore yang belum pernah berhasil berarti gate backup/restore tetap gagal walaupun backup creation sukses.

## Deployment dan migrasi one-shot

1. Aktifkan maintenance window atau traffic control sesuai kebijakan staging.
2. Tarik image berdasarkan digest yang sudah dicatat.
3. Validasi manifest/Compose sebelum membuat resource. Pastikan hanya Nginx memiliki host/public port, backend network internal, dan migration bersifat one-shot.
4. Jalankan PostgreSQL dan Redis, lalu tunggu health dependency.
5. Jalankan target migration satu kali dengan `npm run db:deploy`/`prisma migrate deploy` melalui image migration yang sama dengan artifact release.
6. Wajibkan migration exit code `0`. Simpan log migration yang sudah diperiksa bebas secret.
7. Jangan menjalankan ulang migration development, mengedit migration yang pernah diterapkan, atau memaksa web hidup bila migration gagal.
8. Setelah migration sukses, jalankan web dan worker; terakhir aktifkan Nginx ingress.
9. Bila ini database staging benar-benar baru, jalankan bootstrap first-admin satu kali sesuai custody secret. Eksekusi kedua harus ditolak.

## Pemeriksaan runtime dan hardening

Catat hasil berikut untuk setiap container/service:

- image digest cocok dengan release record;
- proses bukan root;
- root filesystem read-only;
- `no-new-privileges` aktif;
- seluruh Linux capability dijatuhkan;
- privileged mode dan Docker socket tidak tersedia;
- hanya Nginx memiliki binding ingress;
- PostgreSQL, Redis, web, worker, migration, dan bootstrap tetap privat;
- migration berstatus sukses lalu berhenti;
- web, worker, database, Redis, dan Nginx sehat sesuai kontrak masing-masing;
- log rotation dan resource limit platform aktif.

Penyimpangan menghentikan rehearsal. Jangan menandai pengecualian sebagai lulus tanpa persetujuan security/operator tertulis.

## Health dan readiness rehearsal

Probe publik yang diharapkan:

- `/nginx-health` menghasilkan HTTP 200;
- `/api/health/live` menghasilkan HTTP 200 selama proses web sehat, tanpa menyentuh dependency;
- `/api/health/ready` menghasilkan HTTP 200 hanya bila PostgreSQL dan Redis tersedia.

Lakukan fault injection satu dependency pada satu waktu dalam jendela yang disetujui:

1. Pastikan baseline ketiga probe lulus.
2. Putuskan akses Redis dari web tanpa mengekspos service atau mengubah credential permanen.
3. Buktikan liveness tetap 200 dan readiness menjadi 503 tanpa detail connection string/exception.
4. Pulihkan Redis dan buktikan readiness kembali 200.
5. Ulangi untuk PostgreSQL bila DBA dan operator menyetujui. Jangan melakukan destructive database stop saat ada proses backup/migrasi.
6. Verifikasi restart policy tidak menghasilkan loop dan worker pulih setelah dependency kembali.
7. Catat waktu deteksi, waktu pulih, status probe, dan log teredaksi.

Health rehearsal lokal/CI tidak menggantikan rehearsal staging karena network, proxy, scheduler, dan storage platform dapat berbeda.

## Observability dan resource

Sebelum UAT, buktikan bahwa operator dapat melihat tanpa membuka endpoint metrics ke publik:

- CPU, memory working set/limit, disk usage/free space, inode, network, restart count, dan container health;
- PostgreSQL connection/lock/storage/backup status;
- Redis memory, eviction, persistence, dan connection status;
- HTTP rate, latency, 4xx/5xx, readiness transition, dan login 429;
- worker heartbeat, queue depth, failure, retry, dan stalled job;
- alert route, owner, severity, deduplication, dan acknowledgement.

Meter UI CPU/RAM/disk untuk pengguna belum termasuk Foundation implementation saat ini. Observability platform tetap private dan tidak boleh mengekspose host/container identifier atau secret kepada pengguna aplikasi.

Lakukan satu alert rehearsal non-destruktif dan catat waktu trigger, penerimaan, acknowledgement, serta recovery. Jika sumber metrik/threshold belum disepakati, tandai `BLOCKED`, bukan `PASS`.

## Smoke, browser evidence, dan aksesibilitas

1. Gunakan akun staging khusus UAT yang dibuat melalui proses identity admin; jangan gunakan fixture browser CI pada database persisten.
2. Jalankan anonymous/generic denial, login P-10, pagination/detail, principal netral, logout, dan navigasi keyboard melalui Nginx/TLS staging.
3. Jalankan suite Playwright hanya bila credential dapat di-inject tanpa tersimpan pada shell history/artifact. Hapus trace/video setelah triage sesuai retention policy.
4. Axe/WCAG automation merupakan bukti regresi, bukan pengganti screen-reader, zoom/reflow, focus appearance, contrast independen, dan review manual.
5. UAT harus mencatat role peserta, skenario, hasil, defect, dan keputusan; jangan menaruh email/password nyata pada evidence.

Untuk full browser fixture otomatis, gunakan stack disposable terpisah dengan database berakhiran `_browser_test` sebagaimana prosedur di README; jangan arahkan seed ke staging persisten.

## Strategi gagal dan rollback

Migrasi produksi/staging bersifat forward-only. “Rollback aplikasi” hanya aman bila schema baru backward-compatible dengan image sebelumnya.

- **Sebelum migration:** batalkan deployment dan pertahankan versi aktif.
- **Migration gagal sebelum commit:** hentikan web baru, simpan log teredaksi, dan eskalasi ke DBA/engineering. Jangan mengedit migration history atau menjalankan `migrate reset`.
- **Migration sukses, aplikasi baru gagal, schema kompatibel:** arahkan traffic kembali ke digest aplikasi sebelumnya setelah operator memverifikasi kompatibilitas.
- **Migration sukses, schema tidak backward-compatible atau integritas diragukan:** hentikan traffic/mutasi dan lakukan recovery ke target baru dari backup/WAL sesuai keputusan DBA. Jangan restore menimpa database aktif tanpa prosedur platform dan approval eksplisit.
- **Secret terpapar:** hentikan distribusi artifact/log, rotasi secret terkait, cabut session/credential terdampak, dan jalankan incident process.

Setiap rollback harus menyimpan timeline, keputusan actor, digest sebelum/sesudah, posisi migration, recovery point, health, dan hasil integritas.

## Cleanup

1. Hapus container/job one-shot bootstrap dan environment sementaranya.
2. Hapus artifact yang memuat trace/log sesuai retention; pastikan tidak ada secret sebelum upload.
3. Hapus restore target dan browser fixture hanya dengan resource ID/project yang telah diverifikasi disposable.
4. Jangan hapus volume staging aktif.
5. Pastikan tidak ada port sementara, credential lama, token UAT, atau resource orphan.
6. Catat siapa yang memverifikasi cleanup dan kapan.

## Template evidence

| Field | Nilai |
| --- | --- |
| Rehearsal/change ID |  |
| Target dan guard environment |  |
| Commit SHA / CI run |  |
| Image digests |  |
| Migration sebelum/sesudah |  |
| Backup ID / recovery point |  |
| Restore duration / integrity result |  |
| Secret version dan rotasi (tanpa nilai) |  |
| Hardening/port assertion |  |
| Live/ready baseline |  |
| Fault injection dan recovery |  |
| Observability/alert rehearsal |  |
| Browser/accessibility/UAT result |  |
| Cleanup result |  |
| Defect/exception |  |
| Operator / reviewer / approver |  |
| Timestamp dan zona waktu |  |

Status setiap baris harus `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN`. Field kosong tidak boleh ditafsirkan sebagai lulus.

## Kriteria selesai rehearsal

Rehearsal selesai secara teknis hanya jika backup dapat direstore, migration exit `0`, health/fault recovery terbukti, hardening/isolasi sesuai, observability dan alert route teruji, browser smoke lulus, secret sementara dibersihkan, serta evidence direview oleh peran terkait.

Setelah itu, perbarui ledger hanya dari “belum tersedia” menjadi bukti staging yang benar-benar dijalankan. Status Foundation tetap **Belum diterima** sampai UAT, review independen, keputusan Fase 0 yang memblokir, dan sign-off eksplisit dari otoritas pada ledger tersedia.
