import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminPanelController } from './admin-panel.controller';
import { AdminPanelService } from './admin-panel.service';
import { RevenueController } from './revenue/revenue.controller';
import { RevenueService } from './revenue/revenue.service';

/**
 * Panel del admin: solo lectura sobre las tablas de los demás módulos (FI §19), más el panel de
 * ingresos (ADR 0030), que además audita cada exportación.
 */
@Module({
  imports: [UploadsModule],
  controllers: [AdminPanelController, RevenueController],
  providers: [AdminPanelService, RevenueService],
})
export class AdminPanelModule {}
