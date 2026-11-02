import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
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
import {
  InvalidWebhookSignatureError,
  WebhooksNotSupportedError,
} from '../integrations/identity/identity-verification.provider';
import {
  AdminDecisionDto,
  AdminVerificationListDto,
  AdminVerificationResponseDto,
  ListVerificationsQueryDto,
  StartVerificationResponseDto,
  VerificationResponseDto,
} from './dto/identity-verification.dto';
import { IdentityVerificationService } from './identity-verification.service';

/** Cliente o profesional: iniciar y consultar su propia verificación. */
@ApiTags('identity-verification')
@ApiCookieAuth()
@Roles('CUSTOMER', 'PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'identity-verification', version: '1' })
export class IdentityVerificationController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiCreatedResponse({ type: StartVerificationResponseDto })
  start(@CurrentUser() user: AuthUser): Promise<StartVerificationResponseDto> {
    return this.service.start(user);
  }

  @Get('me')
  @ApiOkResponse({ type: VerificationResponseDto })
  getMine(@CurrentUser() user: AuthUser): Promise<VerificationResponseDto> {
    return this.service.getMine(user.id);
  }
}

/** Panel del admin: cola de revisión y decisiones (con motivo y auditoría). */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/identity-verifications', version: '1' })
export class AdminIdentityVerificationController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Get()
  @ApiOkResponse({ type: AdminVerificationListDto })
  list(@Query() query: ListVerificationsQueryDto): Promise<AdminVerificationListDto> {
    return this.service.adminList(query);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: AdminVerificationResponseDto })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDecisionDto,
  ): Promise<AdminVerificationResponseDto> {
    return this.service.adminDecide(admin, id, dto);
  }
}

interface RawBodyRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Lo completa Nest con `rawBody: true` (APP_CREATE_OPTIONS). */
  rawBody?: Buffer;
}

/**
 * Webhook del proveedor. Público y sin CSRF/Origin porque lo llama el proveedor, no un navegador:
 * la autenticidad la da la firma, que valida el adaptador. Fuera de Swagger.
 */
@ApiExcludeController()
@Public()
@SkipCsrf()
@SkipOriginCheck()
@Controller({ path: 'webhooks/identity', version: '1' })
export class IdentityWebhookController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(@Req() req: RawBodyRequest) {
    if (!req.rawBody) throw new UnauthorizedException();
    try {
      const outcome = await this.service.handleWebhook({
        headers: req.headers,
        rawBody: req.rawBody,
      });
      return { received: true, outcome };
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) throw new UnauthorizedException();
      if (error instanceof WebhooksNotSupportedError) throw new NotFoundException();
      throw error;
    }
  }
}
