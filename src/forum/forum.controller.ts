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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
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
} from '../common/decorators';
import { HideContentDto } from '../professionals/dto/professional-profile.dto';
import { CustomersService } from './customers.service';
import {
  CreateForumPostDto,
  CreateForumReplyDto,
  CustomerCardDto,
  CustomerDirectoryPageDto,
  CustomerDirectoryQueryDto,
  ForumLikesDto,
  ForumPageDto,
  ForumPostDetailDto,
  ForumQueryDto,
  ForumReplyDto,
  UpdateForumPostDto,
  UpdateForumReplyDto,
} from './dto/forum.dto';
import { ForumService } from './forum.service';

/**
 * Foro general (FI §13, ADR 0028). Leer es público; publicar, responder y dar "me gusta", para
 * clientes activos y profesionales con plan vigente.
 */
@ApiTags('forum')
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Controller({ path: 'forum', version: '1' })
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  @Get('posts')
  @Public()
  @ApiOkResponse({ type: ForumPageDto })
  list(@Query() query: ForumQueryDto): Promise<ForumPageDto> {
    return this.forum.list(query);
  }

  @Get('posts/:id')
  @Public()
  @ApiOkResponse({ type: ForumPostDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ForumPostDetailDto> {
    return this.forum.get(id);
  }

  @Get('posts/:id/my-likes')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: ForumLikesDto })
  myLikes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ForumLikesDto> {
    return this.forum.myLikes(user, id);
  }

  @Post('posts')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: ForumPostDetailDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateForumPostDto,
  ): Promise<ForumPostDetailDto> {
    return this.forum.create(user, dto);
  }

  @Patch('posts/:id')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: ForumPostDetailDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateForumPostDto,
  ): Promise<ForumPostDetailDto> {
    return this.forum.update(user, id, dto);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.forum.remove(user, id);
  }

  /** Resuelta: deja de admitir respuestas y sigue visible. */
  @Post('posts/:id/resolve')
  @HttpCode(200)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: ForumPostDetailDto })
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ForumPostDetailDto> {
    return this.forum.resolve(user, id);
  }

  @Post('posts/:id/replies')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCreatedResponse({ type: ForumReplyDto })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateForumReplyDto,
  ): Promise<ForumReplyDto> {
    return this.forum.reply(user, id, dto);
  }

  @Patch('replies/:id')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: ForumReplyDto })
  updateReply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateForumReplyDto,
  ): Promise<ForumReplyDto> {
    return this.forum.updateReply(user, id, dto);
  }

  @Delete('replies/:id')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  removeReply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.forum.removeReply(user, id);
  }

  @Put('posts/:id/like')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  likePost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forum.likePost(user, id, true);
  }

  @Delete('posts/:id/like')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  unlikePost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forum.likePost(user, id, false);
  }

  @Put('replies/:id/like')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  likeReply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forum.likeReply(user, id, true);
  }

  @Delete('replies/:id/like')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  unlikeReply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forum.likeReply(user, id, false);
  }
}

/**
 * "Clientes" (pedido del fundador del 2026-11-11, ADR 0037): cualquier profesional con sesión ve el
 * catálogo de clientes activos y abre la ficha de cada uno; sus publicaciones se piden al foro con
 * `GET /forum/posts?authorId=`. Límite por minuto para que la lista no se pueda copiar entera.
 */
@ApiTags('customers')
@ApiCookieAuth()
@Roles('PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOkResponse({ type: CustomerDirectoryPageDto })
  list(@Query() query: CustomerDirectoryQueryDto): Promise<CustomerDirectoryPageDto> {
    return this.customers.list(query);
  }

  @Get(':userId')
  @ApiOkResponse({ type: CustomerCardDto })
  card(@Param('userId', ParseUUIDPipe) userId: string): Promise<CustomerCardDto> {
    return this.customers.card(userId);
  }
}

/** El admin oculta o restaura publicaciones y respuestas, con motivo y auditoría. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: true })
@Roles('ADMIN')
@Controller({ path: 'admin/forum', version: '1' })
export class AdminForumController {
  constructor(private readonly forum: ForumService) {}

  @Post('posts/:id/hide')
  @HttpCode(204)
  @ApiNoContentResponse()
  hidePost(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.forum.moderatePost(admin, id, dto.reason, true);
  }

  @Post('posts/:id/restore')
  @HttpCode(204)
  @ApiNoContentResponse()
  restorePost(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.forum.moderatePost(admin, id, dto.reason, false);
  }

  @Post('replies/:id/hide')
  @HttpCode(204)
  @ApiNoContentResponse()
  hideReply(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.forum.moderateReply(admin, id, dto.reason, true);
  }

  @Post('replies/:id/restore')
  @HttpCode(204)
  @ApiNoContentResponse()
  restoreReply(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.forum.moderateReply(admin, id, dto.reason, false);
  }
}
