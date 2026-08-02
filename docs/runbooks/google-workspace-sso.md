# Runbook Aktivasi Google Workspace Education SSO

## Tujuan dan status

Runbook ini menyiapkan login Google Workspace untuk E-JLS sekolah. Dokumen ini **belum mengaktifkan SSO** dan tidak boleh dipakai untuk membuat login simulasi. Aktivasi baru dilakukan setelah domain sekolah, origin HTTPS, konfigurasi Google Cloud, persetujuan Admin Console, pemetaan user, dan review keamanan selesai.

Kondisi implementasi:

- Login dan explicit identity linking Google Workspace telah tersedia di balik `GOOGLE_OIDC_ENABLED=false`.
- Login fallback tenant-qualified tetap menjadi jalur operasional dan readiness tidak bergantung pada Google.
- Tombol Google selalu ditampilkan; tombol tetap nonaktif sampai konfigurasi lengkap dan feature flag aktif.
- Login memakai callback `/api/auth/google/callback`; linking memakai callback terpisah `/api/auth/google/link/callback`.
- Model data memakai kunci tahan lama `(provider, issuer, subject)`; email tidak pernah dipakai untuk auto-link.
- Nilai client secret tidak boleh ditulis di repository, issue, chat, log, atau artifact.

## Prasyarat yang harus diberikan operator

Minta hanya metadata non-rahasia berikut melalui kanal change record:

- domain Workspace sekolah, misalnya `sekolah.sch.id`;
- Google Cloud project ID yang disetujui;
- OAuth client ID untuk aplikasi web;
- origin aplikasi HTTPS produksi dan staging yang tepat;
- email group/role Admin Google Workspace yang menyetujui aplikasi;
- daftar domain atau organizational unit yang boleh login;
- keputusan provisioning: user harus sudah ada di E-JLS atau boleh dibuat melalui proses undangan terkontrol.

Jangan meminta atau menerima client secret melalui chat. Operator secret memasukkannya langsung ke secret manager atau environment deployment.

## Batas keamanan yang tidak boleh diubah

1. Gunakan OAuth 2.0 authorization-code flow di server, bukan implicit flow dan bukan token di browser storage.
2. Gunakan PKCE dengan verifier acak per transaksi login, `state` acak sekali pakai, dan `nonce` acak sekali pakai.
3. Simpan transaksi OIDC sementara di Redis dengan TTL pendek dan konsumsi atomik pada callback. Callback tanpa state, state kedaluwarsa, atau state yang dipakai ulang harus ditolak.
4. Tukarkan code dari server ke Google token endpoint menggunakan redirect URI yang sama persis. Jangan menerima access token atau ID token yang dikirim dari form browser.
5. Validasi ID token server-side: signature melalui JWKS Google, `iss` yang diizinkan, `aud` sama dengan client ID, `exp`, `iat` dengan clock skew terbatas, `nonce`, dan klaim `sub`.
6. Validasi `hd` hanya sebagai pembatas domain Workspace setelah token bertanda tangan lolos validasi. `hd` bukan pengganti signature validation dan email domain bukan identifier permanen.
7. Gunakan kunci identitas `(issuer, subject)` untuk lookup/link `UserIdentity`. Simpan `sub` tahan perubahan email; jangan mencari user hanya berdasarkan email.
8. Require `email_verified=true`, status user E-JLS `ACTIVE`, tenant yang tepat, dan identity yang telah dilink melalui proses admin. Jangan auto-link akun berdasarkan alamat email tanpa kebijakan eksplisit dan audit.
9. Terbitkan sesi E-JLS opaque yang sama dengan jalur login lain: token acak, hanya hash di database, lifetime tetap, cookie `HttpOnly`, `SameSite=Lax`, dan `Secure` pada HTTPS produksi.
10. Redact code, token, cookie, client secret, authorization URL lengkap, dan klaim identitas sensitif dari log/audit.
11. Sediakan rate limit callback/login dan respons generik untuk kegagalan; jangan membocorkan apakah email Google tertentu sudah terdaftar.
12. Redirect URI produksi dan staging harus berbeda. Jangan memasukkan wildcard atau origin localhost ke client produksi.

## Bagian A — Konfigurasi Google Workspace Admin Console

Dilakukan oleh Admin Google Workspace sekolah:

1. Pastikan domain sekolah terverifikasi pada Workspace dan daftar akun yang boleh memakai E-JLS sudah disepakati.
2. Jika kebijakan organisasi membatasi aplikasi OAuth, tambahkan OAuth client ID E-JLS ke daftar aplikasi internal/trusted sesuai kebijakan sekolah.
3. Jika akses dibatasi per organizational unit atau group, masukkan hanya unit/group yang disetujui. Jangan memberikan akses seluruh domain sebagai langkah sementara tanpa approval.
4. Pastikan scopes minimum yang diminta hanya `openid`, `email`, dan `profile` bila memang diperlukan. Jangan meminta Gmail, Drive, Calendar, atau Admin SDK scope untuk login.
5. Catat approver, timestamp, domain, group/OU, scopes, dan bukti perubahan. Jangan menyalin token atau secret ke evidence.
6. Tetapkan prosedur offboarding: menonaktifkan akun Workspace tidak menggantikan suspend/deactivate user E-JLS; keduanya harus ditangani sesuai kebijakan.

## Bagian B — Konfigurasi Google Cloud OAuth

Dilakukan pada project yang disetujui:

1. Konfigurasi OAuth consent screen sebagai **Internal** bila seluruh akun berada di Workspace yang sama dan kebijakan Google Cloud mengizinkannya. Jika harus External, selesaikan verification/testing-user review sebelum produksi.
2. Buat OAuth client type **Web application**.
3. Daftarkan empat redirect URI HTTPS final pada OAuth client sesuai environment, yaitu pasangan login dan linking:
   - `https://<production-origin>/api/auth/google/callback`
   - `https://<production-origin>/api/auth/google/link/callback`
   - `https://<staging-origin>/api/auth/google/callback`
   - `https://<staging-origin>/api/auth/google/link/callback`
   URI yang dikirim aplikasi harus sama persis dengan yang didaftarkan, termasuk scheme, host, path, dan tanpa query/hash.
   Untuk pengujian lokal saja, implementasi menerima `http://localhost:<port>` (juga loopback `127.0.0.1`/`[::1]`) dengan kedua path callback exact. HTTP pada hostname non-loopback tetap ditolak.
4. Daftarkan origin yang benar untuk alur aplikasi bila diperlukan. Jangan menambahkan wildcard, path yang tidak dipakai, atau origin HTTP produksi.
5. Simpan client ID sebagai konfigurasi non-rahasia terkontrol. Masukkan client secret langsung ke secret manager dengan akses service account web saja.
6. Aktifkan pemantauan perubahan credential dan siapkan rotasi. Setelah rotasi, uji login dan penolakan credential lama pada staging disposable.
7. Catat issuer dan endpoint discovery yang digunakan implementasi. Implementasi harus mengambil JWKS/metadata melalui library OIDC yang memvalidasi signature dan cache key secara aman.

## Bagian C — Konfigurasi aplikasi E-JLS

Tambahkan konfigurasi hanya setelah review implementasi selesai:

- `GOOGLE_OIDC_ISSUER` — issuer yang di-allowlist;
- `GOOGLE_OIDC_CLIENT_ID` — client ID web;
- `GOOGLE_OIDC_CLIENT_SECRET` — secret manager reference/runtime secret, tidak dikomit;
- `GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN` — domain Workspace yang tepat;
- `GOOGLE_OIDC_REDIRECT_URI` — callback login absolut HTTPS sesuai environment;
- `GOOGLE_OIDC_LINK_REDIRECT_URI` — callback linking absolut HTTPS sesuai environment;
- `GOOGLE_OIDC_SCHOOL_CODE` — kode school E-JLS yang diizinkan;
- `GOOGLE_OIDC_ENABLED` — default `false` sampai acceptance checklist lulus.

Nilai domain dan redirect URI harus dicocokkan dengan environment, bukan dibentuk dari input `Host` request. Bila reverse proxy dipakai, gunakan konfigurasi origin eksplisit dan pertahankan validasi origin Server Action.

### Alur login yang diwajibkan

1. `GET /api/auth/google/start` membuat state, nonce, PKCE verifier, return URL yang allowlisted, dan expiry pendek; simpan transaksi di Redis.
2. Server mengarahkan browser ke authorization endpoint Google dengan scopes minimum dan `access_type` yang sesuai kebutuhan. Jangan menaruh secret atau verifier di URL.
3. `GET /api/auth/google/callback` memvalidasi state dan mengonsumsi transaksi satu kali.
4. Server menukar authorization code, memvalidasi ID token, `iss`, `aud`, `exp`, `iat`, `nonce`, `sub`, `email_verified`, dan `hd`.
5. Server mencari `UserIdentity(provider=GOOGLE_WORKSPACE, issuer, subject)` dalam tenant yang benar.
6. Bila identity belum dilink, kembalikan pesan generik dan audit `DENIED`; jangan membuat user otomatis kecuali provisioning policy telah disetujui dan diimplementasikan secara terpisah.
7. Bila user aktif, terbitkan sesi opaque E-JLS dan audit metode `GOOGLE_WORKSPACE`. Jangan menyimpan access token Google karena login dasar tidak membutuhkannya.
8. Hapus transaksi Redis dan redirect ke return URL internal yang telah allowlist. Return URL eksternal harus ditolak.

## Bagian D — Provisioning dan linking user

SSO hanya membuktikan identitas Google; SSO tidak otomatis membuat user atau memberikan role E-JLS.

1. Deploy seluruh migration permission terbaru. Role sistem `admin-akses` menerima `iam.users.provision`, `iam.identities.link`, dan `iam.identities.unlink` sesuai katalog foundation.
2. Bila user target belum ada, Admin Akses membuka `/admin/akses`, panel **Buat pengguna manual**, lalu mengisi nama lengkap, email sekolah, username opsional, dan alasan minimal 12 karakter. Sistem memerlukan autentikasi terbaru dan mengambil school hanya dari principal actor.
3. Provisioning membuat tepat satu user `ACTIVE` dengan sumber `MANUAL` dan identifier ternormalisasi. Sistem tidak membuat password, role, identitas Google, atau sesi otomatis. Jangan memakai ulang bootstrap pertama, seed browser test, atau direct SQL untuk provisioning operasional.
4. Admin Akses memilih user E-JLS target dalam school yang dikelolanya. Target tidak boleh akun admin itu sendiri dan linking hanya diizinkan ketika target berstatus tepat `ACTIVE`.
5. Admin menulis alasan minimal 12 karakter; sistem mensyaratkan sesi actor dan autentikasi terbaru.
6. Admin memilih **Verifikasi dengan Google**, lalu masuk secara interaktif dengan akun Google milik target.
7. Callback linking memvalidasi purpose, callback exact, school, actor/session, target/version, PKCE, state, nonce, `iss`, `aud`, `azp`, `exp`, `sub`, `hd`, dan `email_verified`.
8. Sistem kembali ke Admin Akses dan menampilkan email Google terverifikasi untuk review. Confirmation server-side hanya berlaku satu kali selama sepuluh menit.
9. Admin memilih **Konfirmasi tautan Google**. Sistem kembali memvalidasi actor/session/tenant/target/version, memastikan `(provider, issuer, subject)` belum dipakai user lain, lalu menulis `UserIdentity` dan audit dalam transaksi serializable.
10. Callback/linking tidak pernah menerbitkan sesi login. Audit memuat actor, target, provider, issuer, outcome, reason, dan version tanpa menduplikasi subject/email federasi.

Email hanya informasi review dan snapshot pada record identity. Perbedaan email Google dan email E-JLS bukan dasar auto-link, penolakan otomatis, atau pemindahan identity. Perubahan alamat email Google tidak memutus identity karena lookup memakai `sub`. Suspend/deactivate user E-JLS menolak login berikutnya; role tetap dikelola melalui policy Identity & Access.

### Unlink dan remediation identitas

1. Unlink memakai capability terpisah `iam.identities.unlink`, memerlukan autentikasi terbaru, target bukan actor, alasan minimal 12 karakter, dan tetap tersedia ketika feature flag Google nonaktif.
2. Identity dimuat ulang dari database berdasarkan ID, target, tenant, dan provider; issuer, subject, dan email tidak dipercaya dari browser.
3. Unlink dapat dilakukan pada target berstatus apa pun untuk remediation. Sistem menaikkan versi user, menghapus identity, mencabut hanya sesi aktif bermetode `GOOGLE_WORKSPACE`, dan menulis audit atomik dalam transaction serializable.
4. Sesi fallback tidak dicabut oleh unlink. Audit tidak menduplikasi Google subject atau email snapshot.

## Uji staging disposable sebelum produksi

1. Buat OAuth client staging dengan kedua redirect URI staging HTTPS (login dan linking) yang terpisah dari produksi.
2. Gunakan hanya akun Workspace test yang disetujui; jangan memakai data produksi.
3. Verifikasi success path login untuk user linked aktif dan generic denial untuk user tidak linked, domain salah, email belum verified, token invalid, nonce salah, state expired/replayed, callback/purpose salah, dan user suspended.
4. Verifikasi explicit linking dua tahap: permission benar, self-link ditolak, actor/session/tenant/target/version terikat, confirmation one-use, duplicate subject ditolak, dan callback linking tidak membuat sesi.
5. Pastikan code/state/nonce/PKCE tidak muncul di access log callback, browser storage, response body, atau audit detail.
6. Uji rotasi client secret, cache JWKS key rollover, timeout discovery/token endpoint, dan Google outage. Login harus fail closed tanpa mematikan fallback yang sehat.
7. Jalankan lint, typecheck, unit test OIDC, security test callback, migration verification, build, dan browser evidence melalui Nginx.
8. Periksa audit redaction, session cookie flags, rate limit, response header, dan tidak adanya 5xx yang tidak tertangani.
9. Hapus test user/link dan seluruh resource staging disposable setelah evidence disetujui.

## Acceptance checklist aktivasi

| Pemeriksaan | Status / bukti |
| --- | --- |
| Domain Workspace terverifikasi |  |
| Admin Console approval dan OU/group scope |  |
| OAuth consent screen disetujui |  |
| Kedua pasangan production/staging redirect URI exact dan HTTPS |  |
| Scopes minimum direview |  |
| Client secret masuk secret manager; tidak ada di repository/log |  |
| `GOOGLE_OIDC_ENABLED=false` sebelum cutover |  |
| Migration `iam.identities.link` dan `iam.identities.unlink` diterapkan; role `admin-akses` diverifikasi |  |
| Authorization code + PKCE + state + nonce diuji pada login dan linking |  |
| Purpose/callback separation, actor/session/tenant binding, self-link denial, dan active-only linking diuji |  |
| Unlink terotorisasi, versioned, diaudit, serta hanya mencabut sesi Google diuji |  |
| Signature/JWKS/issuer/audience/time claims diuji |  |
| `hd` signed validation dan `email_verified` diuji |  |
| Lookup `(issuer, sub)` dan linked-user policy diuji; email auto-link ditolak |  |
| Link confirmation one-use dan no-session callback diuji |  |
| Generic denial, rate limit, dan fail-closed diuji |  |
| Session cookie dan audit redaction direview |  |
| Fallback login tetap lulus smoke test |  |
| Rollback flag/config dan owner disetujui |  |
| Security/Workspace approver sign-off |  |

Aktivasi produksi hanya boleh dilakukan setelah seluruh baris memiliki bukti dan approver. Bila salah satu validasi token atau domain tidak tersedia, biarkan SSO nonaktif.

## Cutover dan rollback

1. Deploy kode dengan feature flag tetap `false`.
2. Validasi readiness, fallback login, dan callback route tidak aktif sebelum flag diubah.
3. Aktifkan flag pada satu environment/replica sesuai change window, lalu uji akun linked yang disetujui.
4. Pantau success/denial rate, callback latency, token validation errors, rate-limit events, dan audit outcomes tanpa mencatat token.
5. Rollback dengan menonaktifkan flag terlebih dahulu bila ada anomali. Fallback login tetap menjadi jalur pemulihan.
6. Jika client secret terpapar atau dicurigai bocor, nonaktifkan flag, rotasi secret, cabut sesi terdampak bila perlu, dan jalankan incident process.
7. Jangan menghapus identity database secara manual atau sebagai rollback otomatis; lakukan unlink melalui mutasi Admin Akses yang diaudit.

## Informasi operator untuk aktivasi nyata

Sebelum acceptance staging dan cutover, operator perlu menyediakan metadata berikut melalui change record non-secret:

- domain Workspace sekolah;
- production/staging HTTPS origin;
- client ID dan project ID yang disetujui;
- keputusan internal vs external consent screen;
- OU/group scope;
- kode school E-JLS yang dipetakan;
- bukti bahwa provisioning dan explicit linking manual telah disetujui.

Client secret tetap dimasukkan langsung oleh operator ke secret manager/environment deployment. Jangan kirim nilainya melalui chat.
