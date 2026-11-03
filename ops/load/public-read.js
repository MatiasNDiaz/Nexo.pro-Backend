// Prueba de carga básica (etapa 12): lo que más tráfico va a tener, la lectura pública (catálogo,
// foro, health). Se corre con k6 desde Docker, contra staging (nunca contra producción):
//
//   docker run --rm -i -e BASE_URL=https://api-staging.<dominio> grafana/k6:0.54.0 run - < ops/load/public-read.js
//
// Los umbrales fallan la corrida si el p95 pasa de 500 ms o hay más de 1 % de errores.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '40s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE = `${__ENV.BASE_URL || 'http://host.docker.internal:3001'}/api/v1`;
// Cada usuario virtual simula una IP distinta (detrás del proxy, como en Railway).
const ip = () => `10.${__VU % 250}.${__ITER % 250}.1`;

export default function () {
  const headers = { 'X-Forwarded-For': ip() };
  const responses = http.batch([
    ['GET', `${BASE}/catalog/professionals?limit=20`, null, { headers }],
    ['GET', `${BASE}/forum/posts?limit=20`, null, { headers }],
    ['GET', `${BASE}/professions`, null, { headers }],
    ['GET', `${BASE}/health/ready`, null, { headers }],
  ]);
  for (const res of responses) check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
