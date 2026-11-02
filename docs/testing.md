# Pruebas

| Tipo                       | Ubicación            | Comando            | Qué cubre hoy                                                                                                             |
| -------------------------- | -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Unitarias                  | `src/**/*.spec.ts`   | `npm test`         | Validación del entorno, filtro de errores, ValidationPipe, redacción del logger                                           |
| E2E                        | `test/*.e2e-spec.ts` | `npm run test:e2e` | App real con Supertest: health, prefijo/versión, Helmet, CORS, 404/413/400, rate limit 429, arranque con entorno inválido |
| Integración con PostgreSQL | —                    | —                  | Desde la etapa 4                                                                                                          |

Los tests corren con `node --experimental-vm-modules` porque los paquetes de NestJS 12 son ESM (ver ADR 0004). Para ocultar el aviso experimental en tu consola: `NODE_OPTIONS=--no-warnings=ExperimentalWarning`.

## Reglas

- Los e2e usan `test/utils/create-test-app.ts`, que aplica `configureApp()`: se prueba el mismo pipeline que en producción.
- Un test que necesita otro entorno (por ejemplo, `THROTTLE_LIMIT=3`) fija `process.env` **antes** de importar el `AppModule` con `await import(...)`. Jest aísla `process.env` por archivo.
- Ninguna etapa se da por terminada sin `lint`, `format:check`, `typecheck`, `build`, `test` y `test:e2e` en verde.

## Auditoría de dependencias

CI corre `npm audit --omit=dev --audit-level=high`: solo las dependencias que llegan a la imagen de producción. Las de desarrollo (jest, eslint, CLI de Nest) tienen avisos moderados heredados de `minimatch`, `glob` y `deepmerge`, cuyo único "arreglo" propuesto es bajar de versión mayor. Se revisan en cada etapa.
