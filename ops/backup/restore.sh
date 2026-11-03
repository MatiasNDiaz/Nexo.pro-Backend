#!/bin/sh
# Restaura un backup de backup.sh (ver docs/operacion.md: SIEMPRE primero en staging o en una base
# nueva, nunca encima de producción sin decidirlo).
#
# Variables:
#   TARGET_DATABASE_URL  base DESTINO (con el usuario dueño del esquema: el de migraciones)
#   BACKUP_NAME          archivo a restaurar (nexo-prod-AAAAMMDDTHHMMSSZ.dump.gpg)
#   BACKUP_PASSPHRASE    la misma frase con la que se cifró
#   RESTORE_CONFIRM      tiene que ser "yes": borra y recrea los objetos de la base destino
#   BACKUP_TARGET        r2 (por defecto) o file; con file, el archivo se lee de BACKUP_DIR
#   RESTORE_SKIP_PRIVILEGES  "yes" si en la base destino no existen los roles (prueba aislada)
#   R2_BUCKET, R2_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   (con BACKUP_TARGET=r2)
set -eu

fail() { echo "restore: $1" >&2; exit 1; }
[ -n "${TARGET_DATABASE_URL:-}" ] || fail "falta TARGET_DATABASE_URL"
[ -n "${BACKUP_NAME:-}" ] || fail "falta BACKUP_NAME"
[ -n "${BACKUP_PASSPHRASE:-}" ] || fail "falta BACKUP_PASSPHRASE"
[ "${RESTORE_CONFIRM:-}" = "yes" ] || fail "poné RESTORE_CONFIRM=yes: borra y recrea los objetos de la base destino"
TARGET="${BACKUP_TARGET:-r2}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077
printf '%s' "$BACKUP_PASSPHRASE" > "$WORK/pass"

case "$TARGET" in
  r2) aws s3 cp "s3://$R2_BUCKET/$BACKUP_NAME" "$WORK/backup.gpg" --endpoint-url "$R2_ENDPOINT" --only-show-errors ;;
  file) cp "$BACKUP_DIR/$BACKUP_NAME" "$WORK/backup.gpg" ;;
  *) fail "BACKUP_TARGET desconocido: $TARGET" ;;
esac

echo "restore: descifrando"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$WORK/pass" \
  --decrypt --output "$WORK/db.dump" "$WORK/backup.gpg"

PRIVILEGES=""
[ "${RESTORE_SKIP_PRIVILEGES:-}" = "yes" ] && PRIVILEGES="--no-privileges"

echo "restore: restaurando (todo o nada)"
# shellcheck disable=SC2086
pg_restore --clean --if-exists --no-owner $PRIVILEGES --single-transaction --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" "$WORK/db.dump"

echo "restore: listo. Verificá con: npx typeorm migration:show y GET /api/v1/health/ready"
