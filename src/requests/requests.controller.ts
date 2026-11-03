import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  ContractDto,
  CreateRequestDto,
  ReasonDto,
  RequestDto,
  ScheduleDto,
  SelectTargetDto,
  SendQuoteDto,
} from './dto/requests.dto';
import { RequestsService } from './requests.service';

/** Solicitudes y presupuestos (ADR 0025). Cuentas activas; los ids ajenos responden 404. */
@ApiTags('requests')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Controller({ path: 'requests', version: '1' })
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  /** El cliente envía un pedido a uno o varios profesionales (cada uno en su chat). */
  @Post()
  @Roles('CUSTOMER')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: RequestDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto): Promise<RequestDto> {
    return this.requests.create(user, dto);
  }

  @Get()
  @Roles('CUSTOMER')
  @ApiOkResponse({ type: [RequestDto] })
  mine(@CurrentUser() user: AuthUser): Promise<RequestDto[]> {
    return this.requests.listForCustomer(user);
  }

  /** Pedidos recibidos por el profesional (solo su negociación). */
  @Get('received')
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: [RequestDto] })
  received(@CurrentUser() user: AuthUser): Promise<RequestDto[]> {
    return this.requests.listReceived(user);
  }

  @Get(':id')
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: RequestDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RequestDto> {
    return this.requests.getRequest(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('CUSTOMER')
  @ApiOkResponse({ type: RequestDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ): Promise<RequestDto> {
    return this.requests.cancel(user, id, dto.reason);
  }

  @Post('targets/:targetId/decline')
  @HttpCode(200)
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: RequestDto })
  decline(
    @CurrentUser() user: AuthUser,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: ReasonDto,
  ): Promise<RequestDto> {
    return this.requests.decline(user, targetId, dto.reason);
  }

  /** Presupuesto: reemplaza al vigente si había uno. */
  @Post('targets/:targetId/quotes')
  @Roles('PROFESSIONAL')
  @ApiCreatedResponse({ type: RequestDto })
  quote(
    @CurrentUser() user: AuthUser,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: SendQuoteDto,
  ): Promise<RequestDto> {
    return this.requests.sendQuote(user, targetId, dto);
  }

  @Post('quotes/:quoteId/withdraw')
  @HttpCode(200)
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: RequestDto })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<RequestDto> {
    return this.requests.withdrawQuote(user, quoteId);
  }

  /** El cliente elige al profesional: nace la contratación. */
  @Post('targets/:targetId/select')
  @Roles('CUSTOMER')
  @ApiCreatedResponse({ type: ContractDto })
  select(
    @CurrentUser() user: AuthUser,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: SelectTargetDto,
  ): Promise<ContractDto> {
    return this.requests.select(user, targetId, dto.quoteId);
  }
}

/** Contrataciones (ADR 0025): solo el profesional avanza; los dos pueden cancelar. */
@ApiTags('requests')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('CUSTOMER', 'PROFESSIONAL')
@Controller({ path: 'contracts', version: '1' })
export class ContractsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOkResponse({ type: [ContractDto] })
  list(@CurrentUser() user: AuthUser): Promise<ContractDto[]> {
    return this.requests.listContracts(user);
  }

  @Get(':id')
  @ApiOkResponse({ type: ContractDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ContractDto> {
    return this.requests.getContract(user, id);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: ContractDto })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleDto,
  ): Promise<ContractDto> {
    return this.requests.transition(user, id, 'SCHEDULE', {
      scheduledAt: new Date(dto.scheduledAt),
    });
  }

  /** Empezar: la respuesta sugiere ponerse en "Trabajando" (C-30). */
  @Post(':id/start')
  @HttpCode(200)
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: ContractDto })
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractDto> {
    return this.requests.transition(user, id, 'START');
  }

  /** Terminar: no hace falta que el cliente confirme (FI §11.4). */
  @Post(':id/complete')
  @HttpCode(200)
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: ContractDto })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractDto> {
    return this.requests.transition(user, id, 'COMPLETE');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: ContractDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ): Promise<ContractDto> {
    return this.requests.transition(user, id, 'CANCEL', { reason: dto.reason });
  }
}
