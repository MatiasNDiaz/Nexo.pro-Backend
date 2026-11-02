import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';

const toSnake = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

const tableOf = (tableOrName: Table | string) =>
  (typeof tableOrName === 'string' ? tableOrName : tableOrName.name).split('.').pop() ?? '';

/**
 * Tablas y columnas en snake_case y constraints con nombres legibles y deterministas
 * (`pk_users`, `fk_localities_province_id`, `uq_…`, `ix_…`). Las migraciones escritas a mano usan
 * exactamente estos nombres, así el esquema real y las entidades se pueden comparar en los tests.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? toSnake(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return toSnake([...embeddedPrefixes, customName ?? propertyName].join('_'));
  }

  override relationName(propertyName: string): string {
    return toSnake(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnake(`${relationName}_${referencedColumnName}`);
  }

  override primaryKeyName(tableOrName: Table | string): string {
    return `pk_${tableOf(tableOrName)}`;
  }

  override uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return `uq_${tableOf(tableOrName)}_${columnNames.join('_')}`;
  }

  override foreignKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return `fk_${tableOf(tableOrName)}_${columnNames.join('_')}`;
  }

  override indexName(tableOrName: Table | string, columnNames: string[]): string {
    return `ix_${tableOf(tableOrName)}_${columnNames.join('_')}`;
  }
}
