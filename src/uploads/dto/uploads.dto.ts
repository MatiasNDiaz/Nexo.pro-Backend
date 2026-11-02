import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { FileKind, FilePurpose, FileStatus } from '../file.enums';

export class CreateUploadDto {
  @ApiProperty({ enum: FilePurpose })
  @IsEnum(FilePurpose)
  purpose: FilePurpose;

  @ApiProperty({ enum: FileKind })
  @IsEnum(FileKind)
  kind: FileKind;
}

export class SetAvatarDto {
  @ApiProperty({ format: 'uuid', description: 'Archivo AVATAR propio, ya confirmado (READY)' })
  @IsUUID()
  fileId: string;
}

export class FileResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FilePurpose }) purpose: FilePurpose;
  @ApiProperty({ enum: FileKind }) kind: FileKind;
  @ApiProperty({ enum: FileStatus }) status: FileStatus;
  @ApiProperty({ nullable: true, type: String }) mimeType: string | null;
  @ApiProperty({ nullable: true, type: Number }) sizeBytes: number | null;
  @ApiProperty({ nullable: true, type: Number }) durationMs: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'URL pública si el archivo está listo. Con el adaptador local es una ruta de la API (anteponer su origen).',
  })
  url: string | null;
  @ApiProperty() createdAt: Date;
}

export class UploadTicketDto {
  @ApiProperty({ enum: ['POST', 'PUT'] }) method: 'POST' | 'PUT';
  @ApiProperty({ description: 'Destino de la subida (Cloudinary o, en desarrollo, la propia API)' })
  url: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Campos multipart que acompañan al archivo (campo `file`). No modificarlos.',
  })
  fields: Record<string, string>;
  @ApiProperty() maxBytes: number;
  @ApiProperty() expiresAt: Date;
}

export class CreateUploadResponseDto {
  @ApiProperty({ type: FileResponseDto }) file: FileResponseDto;
  @ApiProperty({ type: UploadTicketDto }) upload: UploadTicketDto;
}
