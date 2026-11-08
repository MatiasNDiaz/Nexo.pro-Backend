import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { sendPrivateContent } from '../uploads/private-content';
import { ChatService } from './chat.service';
import {
  ConversationDto,
  EditMessageDto,
  MessageDto,
  MessagesQueryDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

/**
 * Chat (ADR 0024). Cuentas activas. Los mensajes se envían por acá; el tiempo real solo avisa.
 * Los ids ajenos responden 404.
 */
@ApiTags('chat')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('CUSTOMER', 'PROFESSIONAL')
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Solo el cliente abre un chat, y solo con un profesional visible en el catálogo. */
  @Post('conversations')
  @Roles('CUSTOMER')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCreatedResponse({ type: ConversationDto })
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenConversationDto): Promise<ConversationDto> {
    return this.chat.open(user, dto.professionalId);
  }

  @Get('conversations')
  @ApiOkResponse({ type: [ConversationDto] })
  list(@CurrentUser() user: AuthUser): Promise<ConversationDto[]> {
    return this.chat.list(user);
  }

  @Get('conversations/:id')
  @ApiOkResponse({ type: ConversationDto })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDto> {
    return this.chat.get(user, id);
  }

  @Get('conversations/:id/messages')
  @ApiOkResponse({ type: [MessageDto] })
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<MessageDto[]> {
    return this.chat.messages(user, id, query.before ? new Date(query.before) : null, query.limit);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCreatedResponse({ type: MessageDto })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(user, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.chat.markRead(user, id);
  }

  /** Solo durante los 15 minutos siguientes al envío. */
  @Patch('messages/:id')
  @ApiOkResponse({ type: MessageDto })
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditMessageDto,
  ): Promise<MessageDto> {
    return this.chat.edit(user, id, dto.body);
  }

  @Delete('messages/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.chat.remove(user, id);
  }

  /** Adjunto privado: enlace firmado de 5 minutos (Cloudinary) o el contenido (local). */
  @Get('attachments/:fileId')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPrivateContent(res, await this.chat.attachment(user, fileId));
  }
}
