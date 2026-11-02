#!/bin/sh
# Se ejecuta UNA vez, cuando el volumen de PostgreSQL está vacío (docker-entrypoint-initdb.d).
# - Crea el rol de runtime `nexo_app`: solo SELECT/INSERT/UPDATE/DELETE sobre las tablas que
#   creen las migraciones (que corren con POSTGRES_USER, dueño del esquema).
# - Crea la base `nexo_test` para los tests de integración y e2e.
set -eu

psql -v ON_ERROR_STOP=1 \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -v owner="$POSTGRES_USER" \
  -v db="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE nexo_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"db" TO nexo_app;
GRANT USAGE ON SCHEMA public TO nexo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexo_app;
CREATE DATABASE nexo_test OWNER :"owner";
EOSQL
