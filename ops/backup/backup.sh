#!/bin/sh
# Backup lógico cifrado de la base (etapa 12, SEG §3.6). Lo corre un servicio programado de
# Railway (Dockerfile de esta carpeta) una vez por día, además de los backups propios de Railway.
#
# Variables:
#   DATABASE_URL        conexión de lectura a la base (red privada de Railway)
#   BACKUP_PASSPHRASE   frase para cifrar (AES-256, gpg simétrico). Guardala fuera de Railway:
#                       sin ella el backup no se puede abrir.
#   BACKUP_TARGET       r2 (por defecto) o file (pruebas locales: deja el archivo en BACKUP_DIR)
#   BACKUP_ENV          prefijo del nombre (prod, staging). Por defecto: prod
#   R2_BUCKET, R2_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   (con BACKUP_TARGET=r2)
#   BACKUP_DIR          (con BACKUP_TARGET=file)
set -eu

fail() { echo "backup: $1" >&2; exit 1; }
[ -n "${DATABASE_URL:-}" ] || fail "falta DATABASE_URL"
[ -n "${BACKUP_PASSPHRASE:-}" ] || fail "falta BACKUP_PASSPHRASE"
[ "${#BACKUP_PASSPHRASE}" -ge 24 ] || fail "BACKUP_PASSPHRASE tiene que tener 24 caracteres o más"
TARGET="${BACKUP_TARGET:-r2}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="nexo-${BACKUP_ENV:-prod}-${STAMP}.dump.gpg"
WORK="$(mktemp -d)"
# Lo que quede en el directorio de trabajo (incluido el volcado sin cifrar) se borra siempre.
trap 'rm -rf "$WORK"' EXIT
umask 077
printf '%s' "$BACKUP_PASSPHRASE" > "$WORK/pass"

echo "backup: volcando la base"
pg_dump --format=custom --compress=6 --dbname="$DATABASE_URL" --file="$WORK/db.dump"

echo "backup: cifrando"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$WORK/pass" \
  --symmetric --cipher-algo AES256 --output "$WORK/$NAME" "$WORK/db.dump"
rm -f "$WORK/db.dump"

# Verificación: se descifra y pg_restore tiene que poder leer el índice del volcado.
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$WORK/pass" \
  --decrypt "$WORK/$NAME" | pg_restore --list > /dev/null \
  || fail "el archivo cifrado no se pudo verificar"

case "$TARGET" in
  r2)
    for name in R2_BUCKET R2_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
      eval "[ -n \"\${$name:-}\" ]" || fail "falta $name"
    done
    echo "backup: subiendo $NAME a R2"
    aws s3 cp "$WORK/$NAME" "s3://$R2_BUCKET/$NAME" --endpoint-url "$R2_ENDPOINT" --only-show-errors
    ;;
  file)
    [ -n "${BACKUP_DIR:-}" ] || fail "falta BACKUP_DIR"
    cp "$WORK/$NAME" "$BACKUP_DIR/$NAME"
    ;;
  *) fail "BACKUP_TARGET desconocido: $TARGET" ;;
esac

echo "backup: listo ($NAME, $(wc -c < "$WORK/$NAME") bytes)"
