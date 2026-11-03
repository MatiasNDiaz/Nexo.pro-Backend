import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';
import { LocationsModule } from '../locations/locations.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AccountsPurgeJob } from './accounts-purge.job';
import { AccountsService } from './accounts.service';
import { AdminUsersController } from './admin-users.controller';
import { CustomersController } from './customers.controller';
import { PersonalDataService } from './personal-data.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    AuthModule,
    LocationsModule,
    ProfessionalsModule,
    UploadsModule,
    IdentityVerificationModule,
  ],
  controllers: [UsersController, AdminUsersController, CustomersController],
  providers: [AccountsService, AccountsPurgeJob, PersonalDataService],
  exports: [AccountsService],
})
export class UsersModule {}
