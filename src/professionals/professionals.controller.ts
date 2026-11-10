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
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  AddAvailabilityExceptionDto,
  AddCertificationDto,
  AddMediaDto,
  AdminUpdateProfessionalProfileDto,
  AttentionStatusDto,
  CertificationItemDto,
  HideContentDto,
  MediaItemDto,
  ProfessionalMeDto,
  ProfileThemeDto,
  ReorderMediaDto,
  ReplaceAvailabilityDto,
  ReplaceProfessionsDto,
  ReplaceServiceAreasDto,
  ReplaceSocialLinksDto,
  UpdateProfessionalProfileDto,
  VisibleMediaDto,
  VisibleProfessionsDto,
} from './dto/professional-profile.dto';
import { ContentModerationService } from './content-moderation.service';
import { ProfileService } from './profile.service';

/**
 * Perfil del propio profesional (FI §7 y §10). También mientras espera la verificación: así llega
 * con el perfil completo (la prueba corre desde el registro, ADR 0017).
 */
@ApiTags('professionals')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Obligatorio salvo en GET' })
@Roles('PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'professionals/me', version: '1' })
export class ProfessionalsController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOkResponse({ type: ProfessionalMeDto })
  me(@CurrentUser() user: AuthUser): Promise<ProfessionalMeDto> {
    return this.profiles.me(user.id);
  }

  @Patch()
  @ApiOkResponse({ type: ProfessionalMeDto })
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.update(user.id, dto);
  }

  @Put('theme')
  @ApiOkResponse({ type: ProfessionalMeDto })
  setTheme(
    @CurrentUser() user: AuthUser,
    @Body() dto: ProfileThemeDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.setTheme(user.id, dto);
  }

  @Put('attention-status')
  @ApiOkResponse({ type: ProfessionalMeDto })
  setAttention(
    @CurrentUser() user: AuthUser,
    @Body() dto: AttentionStatusDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.setAttention(user.id, dto);
  }

  @Put('professions')
  @ApiOkResponse({ type: ProfessionalMeDto })
  replaceProfessions(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceProfessionsDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.replaceProfessions(user.id, dto);
  }

  @Put('service-areas')
  @ApiOkResponse({ type: ProfessionalMeDto })
  replaceServiceAreas(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceServiceAreasDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.replaceServiceAreas(user.id, dto);
  }

  @Post('media')
  @ApiCreatedResponse({ type: MediaItemDto })
  addMedia(@CurrentUser() user: AuthUser, @Body() dto: AddMediaDto): Promise<MediaItemDto> {
    return this.profiles.addMedia(user.id, dto);
  }

  @Put('media/order')
  @ApiOkResponse({ type: ProfessionalMeDto })
  reorderMedia(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderMediaDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.reorderMedia(user.id, dto.ids);
  }

  /** Al bajar de plan: qué imágenes y videos mostrar dentro del límite (ADR 0026). */
  @Put('media/visible')
  @ApiOkResponse({ type: ProfessionalMeDto })
  chooseVisibleMedia(
    @CurrentUser() user: AuthUser,
    @Body() dto: VisibleMediaDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.chooseVisibleMedia(user.id, dto.ids);
  }

  @Put('professions/visible')
  @ApiOkResponse({ type: ProfessionalMeDto })
  chooseVisibleProfessions(
    @CurrentUser() user: AuthUser,
    @Body() dto: VisibleProfessionsDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.chooseVisibleProfessions(user.id, dto.professionIds);
  }

  @Delete('media/:id')
  @HttpCode(204)
  removeMedia(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profiles.removeMedia(user.id, id);
  }

  /** ADR 0020: se publica en el momento, como "certificado cargado por el profesional". */
  @Post('certifications')
  @ApiCreatedResponse({ type: CertificationItemDto })
  addCertification(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddCertificationDto,
  ): Promise<CertificationItemDto> {
    return this.profiles.addCertification(user.id, dto);
  }

  @Delete('certifications/:id')
  @HttpCode(204)
  removeCertification(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profiles.removeCertification(user.id, id);
  }

  @Put('social-links')
  @ApiOkResponse({ type: ProfessionalMeDto })
  replaceSocialLinks(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceSocialLinksDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.replaceSocialLinks(user.id, dto);
  }

  @Put('availability')
  @ApiOkResponse({ type: ProfessionalMeDto })
  replaceAvailability(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceAvailabilityDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.replaceAvailability(user.id, dto);
  }

  @Post('availability/exceptions')
  @ApiCreatedResponse({ type: ProfessionalMeDto })
  addException(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddAvailabilityExceptionDto,
  ): Promise<ProfessionalMeDto> {
    return this.profiles.addException(user.id, dto);
  }

  @Delete('availability/exceptions/:id')
  @HttpCode(204)
  removeException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profiles.removeException(user.id, id);
  }
}

/** El admin oculta o restaura contenido de los perfiles, con motivo y auditoría. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: true })
@Roles('ADMIN')
@Controller({ path: 'admin/professionals', version: '1' })
export class AdminProfessionalContentController {
  constructor(
    private readonly moderation: ContentModerationService,
    private readonly profiles: ProfileService,
  ) {}

  /**
   * El perfil completo de un profesional como lo ve él en su panel: fotos y certificados con su id y
   * estado (también los ocultos, con el motivo). Solo lectura: lo necesita el admin para moderarlos.
   */
  @Get(':userId/profile')
  @ApiOkResponse({ type: ProfessionalMeDto })
  profile(@Param('userId', ParseUUIDPipe) userId: string): Promise<ProfessionalMeDto> {
    return this.profiles.me(userId);
  }

  /** Edita los datos del perfil de un profesional (ADR 0021), con motivo y auditoría. */
  @Patch(':userId/profile')
  @ApiOkResponse({ type: ProfessionalMeDto })
  updateProfile(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminUpdateProfessionalProfileDto,
  ): Promise<ProfessionalMeDto> {
    const { reason, ...changes } = dto;
    return this.profiles.update(userId, changes, { adminId: admin.id, reason });
  }

  @Post('media/:id/hide')
  @HttpCode(204)
  hideMedia(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.moderation.hide(admin, 'media', id, dto.reason);
  }

  @Post('media/:id/restore')
  @HttpCode(204)
  restoreMedia(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.moderation.restore(admin, 'media', id, dto.reason);
  }

  @Post('certifications/:id/hide')
  @HttpCode(204)
  hideCertification(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.moderation.hide(admin, 'certification', id, dto.reason);
  }

  @Post('certifications/:id/restore')
  @HttpCode(204)
  restoreCertification(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideContentDto,
  ): Promise<void> {
    return this.moderation.restore(admin, 'certification', id, dto.reason);
  }
}
