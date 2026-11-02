# ADR 0016 — Período de gracia en la baja de cuenta

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Modifica:** ADR 0013 · **Resuelve:** C-36

**Contexto.** El cuestionario pide que el admin pueda restaurar cuentas eliminadas, y la ADR 0013
anonimizaba en el momento, lo que hacía imposible restaurar.

**Decisión.** La baja (propia o del admin) deja la cuenta **desactivada durante 30 días**
(`ACCOUNT_DELETION_GRACE_DAYS`, configurable), con todos sus datos:

- no puede iniciar sesión, se revocan sus sesiones y se anulan sus enlaces pendientes;
- el perfil profesional queda oculto;
- el email sigue reservado (nadie puede registrarse con él);
- el usuario recibe un email con la fecha en que se borrarán sus datos;
- el admin puede **restaurarla** (`POST /admin/users/:id/restore`) mientras dure la gracia.

Vencida la gracia, la cuenta se **anonimiza** como describe la ADR 0013 (`ACCOUNT_ANONYMIZED`).

**Consecuencias.** Columna `users.deletion_scheduled_for`. La anonimización la hace el comando
`npm run accounts:purge`, que hay que correr una vez por día (cron del proveedor) hasta que se apruebe
un programador de tareas dentro de la app. Durante la gracia los datos personales siguen guardados:
entra en la revisión legal de la ADR 0013.
