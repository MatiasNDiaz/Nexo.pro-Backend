import { UserRole } from '../users/user.enums';
import { NotificationType } from './entities/notification.entity';
import { NotificationCategory } from './entities/push.entities';

/**
 * Categoría de cada tipo de aviso (ADR 0032). Un `Record` completo: un tipo nuevo sin categoría no
 * compila.
 */
export const CATEGORY_OF: Record<NotificationType, NotificationCategory> = {
  [NotificationType.NEW_MESSAGE]: NotificationCategory.MESSAGES,
  [NotificationType.NEW_REQUEST]: NotificationCategory.REQUESTS,
  [NotificationType.QUOTE]: NotificationCategory.REQUESTS,
  [NotificationType.CONTRACT_UPDATED]: NotificationCategory.REQUESTS,
  [NotificationType.SUBSCRIPTION_UPDATED]: NotificationCategory.ACCOUNT,
  [NotificationType.REPORT_RESOLVED]: NotificationCategory.ACCOUNT,
  [NotificationType.REPORT_UPHELD]: NotificationCategory.ACCOUNT,
  [NotificationType.MODERATION_ACTION]: NotificationCategory.ACCOUNT,
  [NotificationType.APPEAL_DECIDED]: NotificationCategory.ACCOUNT,
  [NotificationType.SUPPORT_REPLY]: NotificationCategory.ACCOUNT,
  [NotificationType.ADMIN_MESSAGE]: NotificationCategory.ACCOUNT,
  [NotificationType.REVIEW_RECEIVED]: NotificationCategory.COMMUNITY,
  [NotificationType.REVIEW_REPLIED]: NotificationCategory.COMMUNITY,
  [NotificationType.FORUM_REPLY]: NotificationCategory.COMMUNITY,
  [NotificationType.PROFESSIONAL_AVAILABLE]: NotificationCategory.FAVORITES,
  [NotificationType.ANNOUNCEMENT]: NotificationCategory.ANNOUNCEMENTS,
  [NotificationType.PAYMENT_ALERT]: NotificationCategory.ADMIN_ALERTS,
  [NotificationType.MODERATION_ALERT]: NotificationCategory.ADMIN_ALERTS,
  [NotificationType.SECURITY_ALERT]: NotificationCategory.ADMIN_ALERTS,
};

/** Las que conviene que lleguen enseguida aunque el teléfono esté ahorrando batería. */
export const URGENT_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.MESSAGES,
  NotificationCategory.REQUESTS,
  NotificationCategory.ADMIN_ALERTS,
]);

/** Categorías que ve cada rol en sus preferencias: el admin solo recibe sus alertas. */
export function categoriesFor(role: UserRole): NotificationCategory[] {
  return role === UserRole.ADMIN
    ? [NotificationCategory.ADMIN_ALERTS]
    : Object.values(NotificationCategory).filter((c) => c !== NotificationCategory.ADMIN_ALERTS);
}
