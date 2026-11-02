import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AccountsPurgeJob } from './accounts-purge.job';
import { AccountsService } from './accounts.service';
import { AdminUsersController } from './admin-users.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [AuthModule, LocationsModule, ProfessionalsModule, UploadsModule],
  controllers: [UsersController, AdminUsersController],
  providers: [AccountsService, AccountsPurgeJob],
  exports: [AccountsService],
})
export class UsersModule {}
