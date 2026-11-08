import type { Response } from 'express';

/**
 * Envía un archivo privado (adjunto del chat, evidencia de un reporte) ya autorizado: redirección a
 * la URL firmada del almacenamiento o el contenido local.
 *
 * `Cross-Origin-Resource-Policy: same-site` (H-14): `helmet()` manda `same-origin` en todo, y el
 * frontend vive en otro origen del mismo sitio (`app.` y `api.`), así que el navegador no dejaba
 * mostrar el archivo en un `<img>` o `<video>`. Con `same-site` lo muestra el frontend y lo siguen
 * bloqueando los demás sitios. Va también en la redirección, que el navegador revisa antes de seguir.
 */
export function sendPrivateContent(
  res: Response,
  content: { redirectUrl: string } | { data: Buffer; mimeType: string },
): void {
  res.set({ 'Cross-Origin-Resource-Policy': 'same-site', 'Cache-Control': 'private, no-store' });
  if ('redirectUrl' in content) {
    res.redirect(302, content.redirectUrl);
    return;
  }
  res.status(200).set('Content-Type', content.mimeType).send(content.data);
}
