import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AllowAccountStates, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AdminDecisionDto } from './dto/admin-decision.dto';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import { IdentityVerificationService } from './identity-verification.service';

/** Cliente o profesional: iniciar y consultar su propia verificación. */
@Controller({ path: 'identity-verification', version: '1' })
@Roles('CUSTOMER', 'PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
export class IdentityVerificationController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Post()
  @HttpCode(201)
  start(@CurrentUser() user: AuthUser) {
    return this.service.start(user);
  }

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.service.getMine(user.id);
  }
}

/** Panel del admin: cola de revisión y decisiones. */
@Controller({ path: 'admin/identity-verifications', version: '1' })
@Roles('ADMIN')
export class AdminIdentityVerificationController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Get()
  list(@Query() query: ListVerificationsQueryDto) {
    return this.service.adminList(query);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDecisionDto,
  ) {
    return this.service.adminDecide(admin, id, dto);
  }
}
