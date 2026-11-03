# Servicio programado de backups (Railway "Cron"): pg_dump 17 + gpg + cliente S3 para R2.
# Mismo major que la base (PostgreSQL 17). Ver docs/operacion.md.
FROM postgres:17-alpine
RUN apk add --no-cache gnupg aws-cli
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
