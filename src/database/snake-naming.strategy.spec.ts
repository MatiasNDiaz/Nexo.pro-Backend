import { SnakeNamingStrategy } from './snake-naming.strategy';

describe('SnakeNamingStrategy', () => {
  const naming = new SnakeNamingStrategy();

  it('convierte tablas y columnas a snake_case', () => {
    expect(naming.tableName('SubscriptionPlan', undefined)).toBe('subscription_plan');
    expect(naming.tableName('SubscriptionPlan', 'subscription_plans')).toBe('subscription_plans');
    expect(naming.columnName('maxVideoSeconds', undefined, [])).toBe('max_video_seconds');
    expect(naming.columnName('lat', undefined, ['geo'])).toBe('geo_lat');
    expect(naming.joinColumnName('province', 'id')).toBe('province_id');
  });

  it('genera nombres de constraints legibles y deterministas', () => {
    expect(naming.primaryKeyName('provinces')).toBe('pk_provinces');
    expect(naming.foreignKeyName('localities', ['province_id'])).toBe('fk_localities_province_id');
    expect(naming.uniqueConstraintName('professions', ['slug'])).toBe('uq_professions_slug');
    expect(naming.indexName('admin_audit_logs', ['action', 'created_at'])).toBe(
      'ix_admin_audit_logs_action_created_at',
    );
  });
});
