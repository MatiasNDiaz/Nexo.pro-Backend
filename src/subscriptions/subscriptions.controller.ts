import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SubscriptionSummaryDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiCookieAuth()
@Roles('PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Plan, límites y contador de días de la prueba (ADR 0017). */
  @Get('me')
  @ApiOkResponse({ type: SubscriptionSummaryDto })
  me(@CurrentUser() user: AuthUser): Promise<SubscriptionSummaryDto> {
    return this.subscriptions.summary(user.id);
  }
}
