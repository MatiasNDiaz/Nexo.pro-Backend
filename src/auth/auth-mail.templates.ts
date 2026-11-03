import type { MailMessage } from '../integrations/mail/mail-provider';

/**
 * Emails de autenticación, en texto plano. Las rutas del frontend que reciben los tokens están
 * documentadas en docs/auth.md. Los textos son provisorios hasta definir la marca.
 */

export const FRONTEND_PATHS = {
  verifyEmail: '/verificar-email',
  resetPassword: '/restablecer-contrasena',
  linkGoogle: '/vincular-google',
  /** Adonde vuelve el navegador después de Google, con `?resultado=` (ver docs/auth.md). */
  googleResult: '/ingresar/google',
} as const;

const SIGNATURE = '\n\nSi no fuiste vos, ignorá este mensaje o escribinos a soporte.';

export function emailVerificationMail(to: string, firstName: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirmá tu email',
    text: `Hola ${firstName}:\n\nPara confirmar tu email entrá a este enlace (vence en 24 horas):\n${link}${SIGNATURE}`,
  };
}

export function alreadyRegisteredMail(to: string): MailMessage {
  return {
    to,
    subject: 'Intentaron registrarse con tu email',
    text: `Alguien intentó crear una cuenta con este email, pero ya tenés una. Si fuiste vos, iniciá sesión con tu contraseña.${SIGNATURE}`,
  };
}

export function passwordResetMail(to: string, firstName: string, link: string): MailMessage {
  return {
    to,
    subject: 'Restablecé tu contraseña',
    text: `Hola ${firstName}:\n\nPara elegir una contraseña nueva entrá a este enlace (vence en 30 minutos y se puede usar una sola vez):\n${link}\n\nAl cambiarla se cierran todas tus sesiones.${SIGNATURE}`,
  };
}

export function accountDeletionScheduledMail(
  to: string,
  firstName: string,
  deletionScheduledFor: Date,
): MailMessage {
  const date = deletionScheduledFor.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
  });
  return {
    to,
    subject: 'Tu cuenta se va a eliminar',
    text: `Hola ${firstName}:\n\nTu cuenta quedó desactivada y sus datos se eliminarán definitivamente el ${date}. Si fue un error, escribinos a soporte antes de esa fecha para recuperarla.`,
  };
}

export function passwordChangedMail(to: string, firstName: string): MailMessage {
  return {
    to,
    subject: 'Tu contraseña cambió',
    text: `Hola ${firstName}:\n\nLa contraseña de tu cuenta se cambió recién.${SIGNATURE}`,
  };
}

export function googleLinkMail(to: string, firstName: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirmá que querés entrar con Google',
    text: `Hola ${firstName}:\n\nPidieron vincular una cuenta de Google a tu cuenta. Si fuiste vos, confirmalo en este enlace (vence en 30 minutos):\n${link}${SIGNATURE}`,
  };
}
