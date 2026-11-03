import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfig, databaseConfig } from '../config/database.config';
import { buildDataSourceOptions } from './data-source.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (db: DatabaseConfig) => ({
        ...buildDataSourceOptions({
          url: db.url,
          ssl: db.ssl,
          poolMax: db.poolMax,
          statementTimeoutMs: db.statementTimeoutMs,
        }),
        retryAttempts: 5,
        retryDelay: 2000,
      }),
    }),
  ],
})
export class DatabaseModule {}
