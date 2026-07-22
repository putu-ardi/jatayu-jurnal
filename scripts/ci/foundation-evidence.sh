#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ || ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]; then
  echo "Script ini hanya boleh dijalankan pada GitHub Actions dengan identitas run numerik." >&2
  exit 64
fi

PROJECT="ejls-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
if [[ ! "$PROJECT" =~ ^ejls-ci-[0-9]+-[0-9]+$ ]]; then
  echo "Nama project CI tidak aman untuk cleanup." >&2
  exit 64
fi

APP_VERSION="ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
HTTP_PORT="$(node -e 'const net=require("node:net");const server=net.createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})')"
POSTGRES_DB="ejls_ci_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}_browser_test"
POSTGRES_USER="ejls_ci"
POSTGRES_PASSWORD="Ci-Db!Aa1-$(openssl rand -hex 18)"
REDIS_PASSWORD="Ci-Redis!Aa1-$(openssl rand -hex 18)"
EJLS_BOOTSTRAP_CONFIRM="CREATE_FIRST_ADMIN"
EJLS_BOOTSTRAP_ALLOW_PRODUCTION="I_UNDERSTAND"
EJLS_BOOTSTRAP_SCHOOL_CODE="e2e-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
EJLS_BOOTSTRAP_SCHOOL_NAME="E-JLS CI Ephemeral"
EJLS_BOOTSTRAP_TIMEZONE="Asia/Jakarta"
EJLS_BOOTSTRAP_ADMIN_EMAIL="admin-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}@example.test"
EJLS_BOOTSTRAP_ADMIN_NAME="Admin CI"
EJLS_BOOTSTRAP_PASSWORD="Ci-Admin!Aa1-$(openssl rand -hex 18)"
EJLS_E2E_CONFIRM="SEED_EPHEMERAL_BROWSER_TEST"
EJLS_E2E_SCHOOL_CODE="$EJLS_BOOTSTRAP_SCHOOL_CODE"
EJLS_E2E_MEMBER_EMAIL="member-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}@example.test"
EJLS_E2E_MEMBER_NAME="Guru CI"
EJLS_E2E_MEMBER_PASSWORD="Ci-Member!Aa1-$(openssl rand -hex 18)"
E2E_BASE_URL="http://127.0.0.1:${HTTP_PORT}"
E2E_SCHOOL_CODE="$EJLS_BOOTSTRAP_SCHOOL_CODE"
E2E_ADMIN_EMAIL="$EJLS_BOOTSTRAP_ADMIN_EMAIL"
E2E_ADMIN_PASSWORD="$EJLS_BOOTSTRAP_PASSWORD"
E2E_MEMBER_EMAIL="$EJLS_E2E_MEMBER_EMAIL"
E2E_MEMBER_PASSWORD="$EJLS_E2E_MEMBER_PASSWORD"
HTTP_BIND_ADDRESS="127.0.0.1"

export APP_VERSION HTTP_BIND_ADDRESS HTTP_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD REDIS_PASSWORD
export EJLS_BOOTSTRAP_CONFIRM EJLS_BOOTSTRAP_ALLOW_PRODUCTION EJLS_BOOTSTRAP_SCHOOL_CODE
export EJLS_BOOTSTRAP_SCHOOL_NAME EJLS_BOOTSTRAP_TIMEZONE EJLS_BOOTSTRAP_ADMIN_EMAIL
export EJLS_BOOTSTRAP_ADMIN_NAME EJLS_BOOTSTRAP_PASSWORD EJLS_E2E_CONFIRM EJLS_E2E_SCHOOL_CODE
export EJLS_E2E_MEMBER_EMAIL EJLS_E2E_MEMBER_NAME EJLS_E2E_MEMBER_PASSWORD
export E2E_BASE_URL E2E_SCHOOL_CODE E2E_ADMIN_EMAIL E2E_ADMIN_PASSWORD E2E_MEMBER_EMAIL E2E_MEMBER_PASSWORD

for secret in "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" "$EJLS_BOOTSTRAP_PASSWORD" "$EJLS_E2E_MEMBER_PASSWORD"; do
  echo "::add-mask::$secret"
done

compose() {
  docker compose -p "$PROJECT" "$@"
}

capture_diagnostics() {
  mkdir -p test-results/ci
  compose --profile bootstrap ps --all > test-results/ci/compose-ps.txt 2>&1 || true
  compose --profile bootstrap logs --no-color --tail 500 > test-results/ci/compose-logs.txt 2>&1 || true
}

cleanup() {
  local cleanup_status=0
  compose --profile bootstrap down --volumes --remove-orphans || cleanup_status=1
  docker image rm \
    "ejls-web:${APP_VERSION}" \
    "ejls-worker:${APP_VERSION}" \
    "ejls-migrate:${APP_VERSION}" \
    "ejls-bootstrap:${APP_VERSION}" \
    "ejls-nginx:${APP_VERSION}" >/dev/null 2>&1 || true

  local remaining
  remaining="$({
    docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}"
    docker network ls -q --filter "label=com.docker.compose.project=${PROJECT}"
    docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}"
  } | sed '/^$/d')"
  if [[ -n "$remaining" ]]; then
    echo "Resource project CI masih tersisa setelah cleanup." >&2
    cleanup_status=1
  fi
  return "$cleanup_status"
}

finish() {
  local status=$?
  trap - EXIT
  set +e
  if (( status != 0 )); then
    capture_diagnostics
  fi
  cleanup || status=1
  unset POSTGRES_PASSWORD REDIS_PASSWORD EJLS_BOOTSTRAP_PASSWORD EJLS_E2E_MEMBER_PASSWORD
  unset E2E_ADMIN_PASSWORD E2E_MEMBER_PASSWORD
  exit "$status"
}
trap finish EXIT

wait_for_status() {
  local expected="$1"
  local url="$2"
  local attempts="${3:-30}"
  local actual="000"
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    actual="$(curl --silent --output /dev/null --write-out '%{http_code}' "$url" || true)"
    if [[ "$actual" == "$expected" ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Status $url adalah $actual; diharapkan $expected." >&2
  return 1
}

assert_container_hardening() {
  mkdir -p test-results/ci
  : > test-results/ci/container-hardening.txt

  mapfile -t container_ids < <(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}")
  if (( ${#container_ids[@]} != 6 )); then
    echo "Diharapkan tepat enam container core, ditemukan ${#container_ids[@]}." >&2
    return 1
  fi

  local actual_services
  actual_services="$({
    for id in "${container_ids[@]}"; do
      docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$id"
    done
  } | sort)"
  local expected_services=$'database\nmigrate\nnginx\nredis\nweb\nworker'
  if [[ "$actual_services" != "$expected_services" ]]; then
    echo "Set service Compose tidak sesuai:" >&2
    printf '%s\n' "$actual_services" >&2
    return 1
  fi

  local id service user read_only privileged security_options cap_drop published expected_binding
  expected_binding="8080/tcp=127.0.0.1:${HTTP_PORT}"
  for id in "${container_ids[@]}"; do
    service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$id")"
    user="$(docker inspect --format '{{.Config.User}}' "$id")"
    read_only="$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")"
    privileged="$(docker inspect --format '{{.HostConfig.Privileged}}' "$id")"
    security_options="$(docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$id")"
    cap_drop="$(docker inspect --format '{{json .HostConfig.CapDrop}}' "$id")"
    published="$(docker inspect --format '{{range $port, $bindings := .HostConfig.PortBindings}}{{range $bindings}}{{$port}}={{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "$id" | xargs)"

    printf '%s user=%s readOnly=%s privileged=%s published=%s\n' \
      "$service" "$user" "$read_only" "$privileged" "${published:-none}" \
      >> test-results/ci/container-hardening.txt

    if [[ -z "$user" || "$user" == "root" || "$user" == "0" || "$user" == "0:0" ]]; then
      echo "$service berjalan sebagai root atau tanpa user eksplisit." >&2
      return 1
    fi
    if [[ "$read_only" != "true" || "$privileged" != "false" ]]; then
      echo "$service tidak mempertahankan read-only/non-privileged baseline." >&2
      return 1
    fi
    if [[ "$security_options" != *'no-new-privileges:true'* || "$cap_drop" != *'ALL'* ]]; then
      echo "$service tidak mempertahankan no-new-privileges/cap_drop ALL." >&2
      return 1
    fi
    if [[ "$service" == "nginx" ]]; then
      if [[ "$published" != "$expected_binding" ]]; then
        echo "Nginx tidak terikat tepat ke loopback fixture: $published" >&2
        return 1
      fi
    elif [[ -n "$published" ]]; then
      echo "$service memublikasikan port host: $published" >&2
      return 1
    fi
  done
}

compose --profile bootstrap config --quiet
compose --profile bootstrap build --pull
compose up --detach --wait

migration_id="$(compose ps --all --quiet migrate)"
if [[ -z "$migration_id" || "$(docker inspect --format '{{.State.ExitCode}}' "$migration_id")" != "0" ]]; then
  echo "Migration one-shot tidak selesai dengan exit code 0." >&2
  exit 1
fi

wait_for_status 200 "$E2E_BASE_URL/nginx-health"
wait_for_status 200 "$E2E_BASE_URL/api/health/live"
wait_for_status 200 "$E2E_BASE_URL/api/health/ready"
assert_container_hardening

compose exec -T database \
  psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  < scripts/verify-database-invariants.sql

compose --profile bootstrap run --rm bootstrap
compose --profile bootstrap run --rm --no-deps \
  -e NODE_ENV=test \
  -e EJLS_E2E_CONFIRM \
  -e EJLS_E2E_SCHOOL_CODE \
  -e EJLS_E2E_MEMBER_EMAIL \
  -e EJLS_E2E_MEMBER_NAME \
  -e EJLS_E2E_MEMBER_PASSWORD \
  bootstrap npm run seed:browser-test

npm run test:browser

if compose --profile bootstrap run --rm --no-deps \
  -e NODE_ENV=test \
  -e EJLS_E2E_CONFIRM \
  -e EJLS_E2E_SCHOOL_CODE \
  -e EJLS_E2E_MEMBER_EMAIL \
  -e EJLS_E2E_MEMBER_NAME \
  -e EJLS_E2E_MEMBER_PASSWORD \
  bootstrap npm run seed:browser-test > test-results/ci/anti-reseed.txt 2>&1; then
  echo "Guard anti-reseed gagal: seed kedua diterima." >&2
  exit 1
fi
if ! grep -q 'database bukan hasil bootstrap pertama yang bersih' test-results/ci/anti-reseed.txt; then
  echo "Seed kedua ditolak dengan alasan yang tidak diharapkan." >&2
  exit 1
fi

if compose logs --since 10m --no-color 2>&1 | grep -Eiq '([[:space:]]5[0-9]{2}[[:space:]]|error|exception|fatal|panic)'; then
  echo "Log runtime memuat indikator kegagalan sebelum fault rehearsal." >&2
  compose logs --since 10m --no-color 2>&1 \
    | grep -Ei '([[:space:]]5[0-9]{2}[[:space:]]|error|exception|fatal|panic)' \
    | head -100 > test-results/ci/runtime-failures.txt
  exit 1
fi

compose stop redis
wait_for_status 200 "$E2E_BASE_URL/api/health/live"
wait_for_status 503 "$E2E_BASE_URL/api/health/ready"
compose start redis
wait_for_status 200 "$E2E_BASE_URL/api/health/ready" 60

printf 'Foundation CI evidence passed for project %s.\n' "$PROJECT"
