import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AllowAccountStates,
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
  SkipCsrf,
  SkipOriginCheck,
} from '../common/decorators';
import { InvalidPaymentSignatureError } from '../integrations/payments/payment-provider';
import {
  AdminChangePlanDto,
  AdminPaymentListDto,
  AdminPaymentsQueryDto,
  CheckoutDto,
  CheckoutResponseDto,
  PaymentItemDto,
  PlanOptionDto,
} from './dto/payments.dto';
import { PaymentsService } from './payments.service';

/** El profesional elige un plan y paga en Mercado Pago (ADR 0026). */
@ApiTags('subscriptions')
@ApiCookieAuth()
@Roles('PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'subscriptions', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Planes con lo que costaría hoy cada uno: el mes, la diferencia o por qué todavía no. */
  @Get('plans')
  @ApiOkResponse({ type: [PlanOptionDto] })
  plans(@CurrentUser() user: AuthUser): Promise<PlanOptionDto[]> {
    return this.payments.planOptions(user.id);
  }

  /** Crea el pago y devuelve el enlace al checkout de Mercado Pago. */
  @Post('checkout')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto): Promise<CheckoutResponseDto> {
    return this.payments.checkout(user.id, dto.planCode);
  }

  @Get('me/payments')
  @ApiOkResponse({ type: [PaymentItemDto] })
  mine(@CurrentUser() user: AuthUser): Promise<PaymentItemDto[]> {
    return this.payments.mine(user.id);
  }
}

/** Panel del admin: pagos y cambio de plan de común acuerdo (con motivo y auditoría). */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  @ApiOkResponse({ type: AdminPaymentListDto })
  list(@Query() query: AdminPaymentsQueryDto): Promise<AdminPaymentListDto> {
    return this.payments.adminList(query);
  }

  @Post('subscriptions/:userId/plan')
  @HttpCode(204)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiNoContentResponse()
  changePlan(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminChangePlanDto,
  ): Promise<void> {
    return this.payments.adminChangePlan(admin.id, userId, dto);
  }
}

interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  /** Lo completa Nest con `rawBody: true` (APP_CREATE_OPTIONS). */
  rawBody?: Buffer;
}

/**
 * Avisos de Mercado Pago. Público y sin CSRF/Origin porque lo llama Mercado Pago, no un navegador:
 * la autenticidad la da la firma. El aviso no se cree: el estado se consulta a la API.
 */
@ApiExcludeController()
@Public()
@SkipCsrf()
@SkipOriginCheck()
@Controller({ path: 'webhooks/payments', version: '1' })
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async receive(@Req() req: WebhookRequest) {
    try {
      const outcome = await this.payments.handleWebhook({
        headers: req.headers,
        query: req.query,
        rawBody: req.rawBody ?? Buffer.alloc(0),
      });
      return { received: true, outcome };
    } catch (error) {
      if (error instanceof InvalidPaymentSignatureError) throw new UnauthorizedException();
      throw error;
    }
  }
}
