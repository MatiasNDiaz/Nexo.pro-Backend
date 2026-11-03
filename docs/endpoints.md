# Inventario de endpoints

Generado desde las rutas que registra la app; `test/endpoint-inventory.e2e-spec.ts` falla si
queda desactualizado (se regenera con `UPDATE_ENDPOINTS=1 npm run test:e2e -- endpoint-inventory`).
Lo que hacen cumplir los guards globales en cada ruta: autenticación,
rol, estados de cuenta admitidos, token CSRF, Origin y límite de pedidos. La propiedad de cada
recurso (anti-IDOR) la valida cada servicio; ver `docs/revision-seguridad.md`.

| Ruta | Rol | Estados de cuenta | CSRF | Origin | Límite |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/admin/announcements` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/announcements` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/appeals` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/appeals/:id/decide` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/dashboard` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/forum/posts/:id/hide` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/forum/posts/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/forum/replies/:id/hide` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/forum/replies/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/identity-verifications` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/identity-verifications/:id/decision` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/neighborhoods` | ADMIN | ACTIVE | — | — | global |
| `PATCH /api/v1/admin/neighborhoods/:id` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/neighborhoods/:id/approve` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/neighborhoods/:id/merge` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/payments` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/platform-reviews` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/platform-reviews/:id/publish` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/platform-reviews/:id/unpublish` | ADMIN | ACTIVE | Sí | Sí | global |
| `PATCH /api/v1/admin/professionals/:userId/profile` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/professionals/certifications/:id/hide` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/professionals/certifications/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/professionals/media/:id/hide` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/professionals/media/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/reports` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/reports/:id` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/reports/:id/conversation` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/reports/:id/resolve` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/reports/:id/review` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/revenue/exports` | ADMIN | ACTIVE | Sí | Sí | 10/h |
| `GET /api/v1/admin/revenue/payments` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/revenue/registrations` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/revenue/summary` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/reviews/:id/hide` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/reviews/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/sanctions/:id/lift` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/strikes/:id/void` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/subscriptions/:userId/plan` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/support/tickets` | ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/admin/support/tickets/:id` | ADMIN | ACTIVE | — | — | global |
| `POST /api/v1/admin/support/tickets/:id/close` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/support/tickets/:id/messages` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/users` | ADMIN | ACTIVE | — | — | global |
| `DELETE /api/v1/admin/users/:id` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/admin/users/:id` | ADMIN | ACTIVE | — | — | global |
| `PATCH /api/v1/admin/users/:id` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/ban` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/change-role` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/message` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/password-reset` | ADMIN | ACTIVE | Sí | Sí | 10/min |
| `POST /api/v1/admin/users/:id/restore` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/revoke-sessions` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/sanctions` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/strikes` | ADMIN | ACTIVE | Sí | Sí | global |
| `POST /api/v1/admin/users/:id/suspend` | ADMIN | ACTIVE | Sí | Sí | global |
| `GET /api/v1/announcements/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `GET /api/v1/auth/csrf` | Público | — | — | — | global |
| `POST /api/v1/auth/email/resend` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 3/h |
| `POST /api/v1/auth/email/verify` | Público | — | No | Sí | 10/min |
| `GET /api/v1/auth/google` | Público | — | — | — | 20/min |
| `GET /api/v1/auth/google/callback` | Público | — | — | — | 20/min |
| `DELETE /api/v1/auth/google/link` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/auth/google/link` | Público | — | No | Sí | 5/min |
| `POST /api/v1/auth/google/link/confirm` | Público | — | No | Sí | 10/min |
| `POST /api/v1/auth/google/link/email` | Público | — | No | Sí | 3/min |
| `GET /api/v1/auth/google/pending` | Público | — | — | — | global |
| `POST /api/v1/auth/google/register` | Público | — | No | Sí | 5/min |
| `POST /api/v1/auth/login` | Público | — | No | Sí | 5/min |
| `POST /api/v1/auth/logout` | Público | — | No | Sí | global |
| `POST /api/v1/auth/logout-all` | Cualquier rol | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | Sí | Sí | global |
| `GET /api/v1/auth/me` | Cualquier rol | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | — | — | global |
| `POST /api/v1/auth/mfa/verify` | Público | — | No | Sí | 5/min |
| `POST /api/v1/auth/password/change` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 5/min |
| `POST /api/v1/auth/password/forgot` | Público | — | No | Sí | 3/h |
| `POST /api/v1/auth/password/reset` | Público | — | No | Sí | 5/min |
| `POST /api/v1/auth/password/set` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 5/min |
| `POST /api/v1/auth/refresh` | Público | — | No | Sí | 30/min |
| `POST /api/v1/auth/register` | Público | — | No | Sí | 5/min |
| `GET /api/v1/auth/sessions` | Cualquier rol | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | — | — | global |
| `DELETE /api/v1/auth/sessions/:id` | Cualquier rol | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | Sí | Sí | global |
| `POST /api/v1/auth/sessions/close-by-link` | Público | — | No | Sí | 10/h |
| `GET /api/v1/catalog/professionals` | Público | — | — | — | global |
| `GET /api/v1/catalog/professionals/:slug` | Público | — | — | — | 30/min |
| `GET /api/v1/catalog/professionals/:slug/reviews` | Público | — | — | — | global |
| `GET /api/v1/chat/attachments/:fileId` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `GET /api/v1/chat/conversations` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/chat/conversations` | CUSTOMER | ACTIVE | Sí | Sí | 20/min |
| `GET /api/v1/chat/conversations/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `GET /api/v1/chat/conversations/:id/messages` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/chat/conversations/:id/messages` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | 30/min |
| `POST /api/v1/chat/conversations/:id/read` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/chat/messages/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `PATCH /api/v1/chat/messages/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/contracts` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `GET /api/v1/contracts/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/contracts/:id/cancel` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/contracts/:id/complete` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/contracts/:id/schedule` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/contracts/:id/start` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/customers/me` | CUSTOMER | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `PATCH /api/v1/customers/me` | CUSTOMER | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `GET /api/v1/evidence/:fileId` | CUSTOMER, PROFESSIONAL, ADMIN | ACTIVE | — | — | global |
| `GET /api/v1/favorites` | CUSTOMER | ACTIVE | — | — | global |
| `DELETE /api/v1/favorites/:professionalId` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `PATCH /api/v1/favorites/:professionalId` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `PUT /api/v1/favorites/:professionalId` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `GET /api/v1/forum/posts` | Público | — | — | — | global |
| `POST /api/v1/forum/posts` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | 10/min |
| `DELETE /api/v1/forum/posts/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/forum/posts/:id` | Público | — | — | — | global |
| `PATCH /api/v1/forum/posts/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/forum/posts/:id/like` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `PUT /api/v1/forum/posts/:id/like` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/forum/posts/:id/my-likes` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/forum/posts/:id/replies` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | 30/min |
| `POST /api/v1/forum/posts/:id/resolve` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/forum/replies/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `PATCH /api/v1/forum/replies/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/forum/replies/:id/like` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `PUT /api/v1/forum/replies/:id/like` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/health/live` | Público | — | — | — | global |
| `GET /api/v1/health/ready` | Público | — | — | — | global |
| `POST /api/v1/identity-verification` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 5/min |
| `GET /api/v1/identity-verification/me` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `GET /api/v1/locations/localities` | Público | — | — | — | global |
| `GET /api/v1/locations/neighborhoods` | Público | — | — | — | global |
| `GET /api/v1/locations/provinces` | Público | — | — | — | global |
| `POST /api/v1/moderation/appeals` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | Sí | Sí | 5/min |
| `GET /api/v1/moderation/me` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED | — | — | global |
| `GET /api/v1/notifications` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `POST /api/v1/notifications/:id/read` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/notifications/read-all` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `GET /api/v1/notifications/unread-count` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `GET /api/v1/platform-reviews` | Público | — | — | — | global |
| `DELETE /api/v1/platform-reviews/me` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/platform-reviews/me` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `PUT /api/v1/platform-reviews/me` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/professionals/me` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `PATCH /api/v1/professionals/me` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/attention-status` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/availability` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/professionals/me/availability/exceptions` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/professionals/me/availability/exceptions/:id` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/professionals/me/certifications` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/professionals/me/certifications/:id` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/professionals/me/media` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/professionals/me/media/:id` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/media/order` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/media/visible` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/professions` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/professions/visible` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/service-areas` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/social-links` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/professionals/me/theme` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `GET /api/v1/professions` | Público | — | — | — | global |
| `POST /api/v1/reports` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | 10/min |
| `GET /api/v1/reports/mine` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `GET /api/v1/requests` | CUSTOMER | ACTIVE | — | — | global |
| `POST /api/v1/requests` | CUSTOMER | ACTIVE | Sí | Sí | 10/min |
| `GET /api/v1/requests/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/requests/:id/cancel` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `POST /api/v1/requests/quotes/:quoteId/withdraw` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/requests/received` | PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/requests/targets/:targetId/decline` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/requests/targets/:targetId/quotes` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/requests/targets/:targetId/select` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `POST /api/v1/reviews` | CUSTOMER | ACTIVE | Sí | Sí | 10/min |
| `DELETE /api/v1/reviews/:id` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `PATCH /api/v1/reviews/:id` | CUSTOMER | ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/reviews/:id/reply` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `PUT /api/v1/reviews/:id/reply` | PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `GET /api/v1/reviews/mine` | CUSTOMER | ACTIVE | — | — | global |
| `GET /api/v1/reviews/received` | PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/subscriptions/checkout` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 10/min |
| `GET /api/v1/subscriptions/me` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `GET /api/v1/subscriptions/me/payments` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `GET /api/v1/subscriptions/plans` | PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `POST /api/v1/support/contact` | Público | — | No | Sí | 3/h |
| `GET /api/v1/support/tickets` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/support/tickets` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | 5/min |
| `GET /api/v1/support/tickets/:id` | CUSTOMER, PROFESSIONAL | ACTIVE | — | — | global |
| `POST /api/v1/support/tickets/:id/messages` | CUSTOMER, PROFESSIONAL | ACTIVE | Sí | Sí | global |
| `POST /api/v1/uploads` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 20/min |
| `POST /api/v1/uploads/:id/complete` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `GET /api/v1/uploads/:id/content` | Público | — | — | — | global |
| `PUT /api/v1/uploads/:id/content` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `DELETE /api/v1/users/me` | Cualquier rol | PENDING_VERIFICATION, ACTIVE | Sí | Sí | 5/min |
| `GET /api/v1/users/me` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | — | — | global |
| `PATCH /api/v1/users/me` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `PUT /api/v1/users/me/avatar` | CUSTOMER, PROFESSIONAL | PENDING_VERIFICATION, ACTIVE | Sí | Sí | global |
| `POST /api/v1/webhooks/identity` | Público | — | No | No (firma) | 60/min |
| `POST /api/v1/webhooks/payments` | Público | — | No | No (firma) | 120/min |
