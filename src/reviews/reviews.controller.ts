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
import { type AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { HideContentDto } from '../professionals/dto/professional-profile.dto';
import {
  AdminPlatformReviewsQueryDto,
  CreateReviewDto,
  OwnReviewDto,
  PageQueryDto,
  PlatformReviewDto,
  PlatformReviewInputDto,
  PlatformReviewPageDto,
  ReviewPageDto,
  ReviewReplyDto,
  UpdateReviewDto,
} from './dto/reviews.dto';
import { PlatformReviewsService } from './platform-reviews.service';
import { ReviewsService } from './reviews.service';

/** Reseñas de contrataciones terminadas (ADR 0028). Cuentas activas. */
@ApiTags('reviews')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Roles('CUSTOMER')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: OwnReviewDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto): Promise<OwnReviewDto> {
    return this.reviews.create(user, dto);
  }

  @Get('mine')
  @Roles('CUSTOMER')
  @ApiOkResponse({ type: [OwnReviewDto] })
  mine(@CurrentUser() user: AuthUser): Promise<OwnReviewDto[]> {
    return this.reviews.mine(user);
  }

  @Get('received')
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: [OwnReviewDto] })
  received(@CurrentUser() user: AuthUser): Promise<OwnReviewDto[]> {
    return this.reviews.received(user);
  }

  /** Dentro de los 30 días desde que terminó el trabajo. */
  @Patch(':id')
  @Roles('CUSTOMER')
  @ApiOkResponse({ type: OwnReviewDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<OwnReviewDto> {
    return this.reviews.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('CUSTOMER')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.reviews.remove(user, id);
  }

  @Put(':id/reply')
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: OwnReviewDto })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReplyDto,
  ): Promise<OwnReviewDto> {
    return this.reviews.reply(user, id, dto.body);
  }

  @Delete(':id/reply')
  @Roles('PROFESSIONAL')
  @ApiOkResponse({ type: OwnReviewDto })
  removeReply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OwnReviewDto> {
    return this.reviews.reply(user, id, null);
  }
}

/** Reseñas públicas del profesional del catálogo. */
@ApiTags('catalog')
@Public()
@Controller({ path: 'catalog/professionals', version: '1' })
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':slug/reviews')
  @ApiOkResponse({ type: ReviewPageDto })
  list(@Param('slug') slug: string, @Query() query: PageQueryDto): Promise<ReviewPageDto> {
    return this.reviews.forProfile(slug.slice(0, 80), query.page, query.limit);
  }
}

/** Opiniones sobre la plataforma: públicas solo las que publica el admin. */
@ApiTags('platform-reviews')
@Controller({ path: 'platform-reviews', version: '1' })
export class PlatformReviewsController {
  constructor(private readonly platform: PlatformReviewsService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: PlatformReviewPageDto })
  published(@Query() query: PageQueryDto): Promise<PlatformReviewPageDto> {
    return this.platform.published(query.page, query.limit);
  }

  @Get('me')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiOkResponse({ type: PlatformReviewDto })
  mine(@CurrentUser() user: AuthUser): Promise<PlatformReviewDto | null> {
    return this.platform.mine(user);
  }

  @Put('me')
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: PlatformReviewDto })
  upsert(
    @CurrentUser() user: AuthUser,
    @Body() dto: PlatformReviewInputDto,
  ): Promise<PlatformReviewDto> {
    return this.platform.upsert(user, dto);
  }

  @Delete('me')
  @HttpCode(204)
  @ApiCookieAuth()
  @Roles('CUSTOMER', 'PROFESSIONAL')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  remove(@CurrentUser() user: AuthUser): Promise<void> {
    return this.platform.remove(user);
  }
}

/** Admin: ocultar reseñas (con motivo) y publicar opiniones de la plataforma. Auditado. */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Controller({ path: 'admin', version: '1' })
export class AdminReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly platform: PlatformReviewsService,
  ) {}

  @Post('reviews/:id/hide')
  @HttpCode(204)
  @ApiNoContentResponse()
  hide(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.reviews.adminModerate(admin, id, dto.reason, true);
  }

  @Post('reviews/:id/restore')
  @HttpCode(204)
  @ApiNoContentResponse()
  restore(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.reviews.adminModerate(admin, id, dto.reason, false);
  }

  @Get('platform-reviews')
  @ApiOkResponse({ type: PlatformReviewPageDto })
  platformReviews(@Query() query: AdminPlatformReviewsQueryDto): Promise<PlatformReviewPageDto> {
    return this.platform.adminList(query);
  }

  @Post('platform-reviews/:id/publish')
  @HttpCode(204)
  @ApiNoContentResponse()
  publish(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.platform.setPublished(admin, id, true);
  }

  @Post('platform-reviews/:id/unpublish')
  @HttpCode(204)
  @ApiNoContentResponse()
  unpublish(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.platform.setPublished(admin, id, false);
  }
}
