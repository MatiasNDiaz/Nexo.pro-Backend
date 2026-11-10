// Verifica que la clave de Cloudinary de este ambiente alcance para lo que hace el backend (ADR 0036).
// Usa SOLO un archivo de prueba dentro de `<CLOUDINARY_FOLDER>/_verificacion/` y lo borra al final:
// nunca lista, mueve ni borra otros archivos de la cuenta.
// Uso: npm run check:cloudinary   (lee .env.<NODE_ENV> y .env.<NODE_ENV>.local; NODE_ENV=development)
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';

const nodeEnv = process.env.NODE_ENV ?? 'development';
for (const file of [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const {
  CLOUDINARY_CLOUD_NAME: cloudName,
  CLOUDINARY_API_KEY: apiKey,
  CLOUDINARY_API_SECRET: apiSecret,
} = process.env;
const folder = process.env.CLOUDINARY_FOLDER ?? 'repara-ya/dev';
if (!cloudName || !apiKey || !apiSecret) {
  console.error(
    'Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET en el .env.',
  );
  process.exit(1);
}
cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

const publicId = `${folder}/_verificacion/${randomUUID()}`;
// PNG de 1×1 px.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const describe = (error) => {
  const code = error?.error?.http_code ?? error?.http_code ?? error?.status;
  const message = error?.error?.message ?? error?.message ?? String(error);
  return `${code ?? ''} ${message}`.trim();
};
const results = [];
async function step(name, permission, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n      ${describe(error)}\n      Permiso necesario: ${permission}`);
  }
}

console.log(`Cloudinary: cuenta ${cloudName}, clave ${apiKey.slice(0, 4)}…, carpeta ${folder}`);
console.log(`Archivo de prueba: ${publicId}\n`);

await step(
  'Subir con firma dentro de la carpeta (como los usuarios)',
  'agregar archivos en la carpeta',
  async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      public_id: publicId,
      timestamp,
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
    };
    const signature = cloudinary.utils.api_sign_request(params, apiSecret);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...params,
      timestamp: String(timestamp),
      api_key: apiKey,
      signature,
    }))
      form.append(key, value);
    form.append('file', new Blob([png], { type: 'image/png' }), 'prueba.png');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok)
      throw { http_code: response.status, message: (await response.json()).error?.message };
  },
);
await step(
  'Consultar el archivo (tipo y peso reales)',
  'ver los archivos de la carpeta (Admin API)',
  async () => {
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'image',
      type: 'upload',
    });
    if (resource.format !== 'png') throw new Error(`formato inesperado: ${resource.format}`);
  },
);
await step(
  'Pasar a privado (ocultar contenido)',
  'editar o renombrar archivos de la carpeta',
  async () => {
    await cloudinary.uploader.rename(publicId, publicId, {
      resource_type: 'image',
      type: 'upload',
      to_type: 'authenticated',
      invalidate: true,
    });
  },
);
await step(
  'Descargar con enlace firmado (archivos privados)',
  'descargar archivos restringidos',
  async () => {
    const url = cloudinary.utils.private_download_url(publicId, 'png', {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    const response = await fetch(url);
    if (!response.ok)
      throw { http_code: response.status, message: 'el enlace firmado no descargó el archivo' };
  },
);
await step(
  'Volver a público (restaurar contenido)',
  'editar o renombrar archivos de la carpeta',
  async () => {
    await cloudinary.uploader.rename(publicId, publicId, {
      resource_type: 'image',
      type: 'authenticated',
      to_type: 'upload',
      invalidate: true,
    });
  },
);
await step('Borrar el archivo de prueba', 'borrar archivos de la carpeta', async () => {
  for (const type of ['upload', 'authenticated']) {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      type,
      invalidate: true,
    });
    if (!['ok', 'not found'].includes(result.result))
      throw new Error(`respuesta: ${result.result}`);
  }
});

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed
    ? `\n${failed} de ${results.length} operaciones fallaron: la clave necesita más permisos.`
    : `\nLa clave alcanza para todo lo que hace el backend.`,
);
if (failed && results[0].ok && !results.at(-1).ok)
  console.log(`Ojo: quedó el archivo de prueba ${publicId}; borralo desde la Media Library.`);
process.exitCode = failed ? 1 : 0;
