import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT_LOGGER } from './audit-logger';
import { AuditService } from './audit.service';
import { AdminAuditLog } from './entities/admin-audit-log.entity';

/** Global: cualquier módulo puede auditar inyectando `AUDIT_LOGGER`, sin importar este módulo. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  providers: [AuditService, { provide: AUDIT_LOGGER, useExisting: AuditService }],
  exports: [AUDIT_LOGGER],
})
export class AuditModule {}
