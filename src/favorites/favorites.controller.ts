import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { FavoriteAlertsDto, FavoriteDto, SaveFavoriteDto } from './dto/favorites.dto';
import { FavoritesService } from './favorites.service';

/** Favoritos del cliente activo (ADR 0028). */
@ApiTags('favorites')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('CUSTOMER')
@Controller({ path: 'favorites', version: '1' })
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOkResponse({ type: [FavoriteDto] })
  list(@CurrentUser() user: AuthUser): Promise<FavoriteDto[]> {
    return this.favorites.list(user);
  }

  @Put(':professionalId')
  @HttpCode(204)
  @ApiNoContentResponse()
  save(
    @CurrentUser() user: AuthUser,
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @Body() dto: SaveFavoriteDto,
  ): Promise<void> {
    return this.favorites.save(user, professionalId, dto.availabilityAlerts);
  }

  @Patch(':professionalId')
  @HttpCode(204)
  @ApiNoContentResponse()
  setAlerts(
    @CurrentUser() user: AuthUser,
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @Body() dto: FavoriteAlertsDto,
  ): Promise<void> {
    return this.favorites.setAlerts(user, professionalId, dto.availabilityAlerts);
  }

  @Delete(':professionalId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
  ): Promise<void> {
    return this.favorites.remove(user, professionalId);
  }
}
