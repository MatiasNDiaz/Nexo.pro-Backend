import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { AccountsService } from './accounts.service';
import { AdminUsersController } from './admin-users.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [AuthModule, LocationsModule, ProfessionalsModule],
  controllers: [UsersController, AdminUsersController],
  providers: [AccountsService],
})
export class UsersModule {}
