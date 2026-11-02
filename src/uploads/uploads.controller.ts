import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  AllowAccountStates,
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../common/decorators';
import { CreateUploadDto, CreateUploadResponseDto, FileResponseDto } from './dto/uploads.dto';
import { MAX_UPLOAD_BYTES } from './file-policies';
import { UploadsService } from './uploads.service';

/** Lo que entrega multer en memoria (evita depender de @types/multer). */
interface UploadedBinary {
  buffer: Buffer;
}

/**
 * Subida de archivos (ADR 0018): pedir ticket → subir directo al proveedor → confirmar.
 * Clientes y profesionales, también mientras esperan la verificación (la foto es requisito).
 */
@ApiTags('uploads')
@ApiCookieAuth()
@ApiHeader({ name: 'X-CSRF-Token', required: true })
@Roles('CUSTOMER', 'PROFESSIONAL')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCreatedResponse({ type: CreateUploadResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadDto,
  ): Promise<CreateUploadResponseDto> {
    return this.uploads.create(user, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: FileResponseDto })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileResponseDto> {
    return this.uploads.complete(user, id);
  }

  /**
   * Destino del ticket con el adaptador local (desarrollo y tests). Con Cloudinary responde 404:
   * el navegador sube directo a Cloudinary.
   */
  @Put(':id/content')
  @HttpCode(204)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }),
  )
  async uploadContent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedBinary | undefined,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Falta el archivo.' });
    }
    await this.uploads.storeLocalContent(user, id, file.buffer);
  }
}

/** Archivos públicos del adaptador local (desarrollo y tests). En producción los sirve Cloudinary. */
@ApiTags('uploads')
@Controller({ path: 'uploads', version: '1' })
export class LocalFilesController {
  constructor(private readonly uploads: UploadsService) {}

  @Public()
  @Get(':id/content')
  async content(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { data, mimeType } = await this.uploads.readLocalPublic(id);
    res
      .status(200)
      .set({
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
        // Lo muestra el frontend (otro origen) en un <img>.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .send(data);
  }
}
