import { UserRole } from '../users/user.enums';
import { NotificationType } from './entities/notification.entity';
import { NotificationCategory } from './entities/push.entities';
import { CATEGORY_OF, categoriesFor } from './notification-categories';

describe('Categorías de avisos (ADR 0032)', () => {
  it('las alertas del admin son solo para el admin', () => {
    expect(categoriesFor(UserRole.ADMIN)).toEqual([NotificationCategory.ADMIN_ALERTS]);
    for (const role of [UserRole.CUSTOMER, UserRole.PROFESSIONAL]) {
      expect(categoriesFor(role)).not.toContain(NotificationCategory.ADMIN_ALERTS);
      expect(categoriesFor(role)).toHaveLength(6);
    }
  });

  it('los avisos de pagos, moderación y seguridad del admin caen en sus alertas', () => {
    expect(
      [
        NotificationType.PAYMENT_ALERT,
        NotificationType.MODERATION_ALERT,
        NotificationType.SECURITY_ALERT,
      ].map((t) => CATEGORY_OF[t]),
    ).toEqual(Array(3).fill(NotificationCategory.ADMIN_ALERTS));
    expect(CATEGORY_OF[NotificationType.NEW_MESSAGE]).toBe(NotificationCategory.MESSAGES);
    expect(CATEGORY_OF[NotificationType.ANNOUNCEMENT]).toBe(NotificationCategory.ANNOUNCEMENTS);
  });
});
