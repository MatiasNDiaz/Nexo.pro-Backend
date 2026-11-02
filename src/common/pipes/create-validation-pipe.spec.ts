import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MaxLength, ValidateNested } from 'class-validator';
import { createValidationPipe } from './create-validation-pipe';

class AddressDto {
  @IsString()
  @MaxLength(5)
  street: string;
}

class SampleDto {
  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

const metadata = { type: 'body' as const, metatype: SampleDto };

async function rejectionOf(value: unknown): Promise<Record<string, unknown>> {
  try {
    await createValidationPipe().transform(value, metadata);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as Record<string, unknown>;
  }
  throw new Error('Se esperaba que la validación fallara');
}

describe('createValidationPipe', () => {
  it('acepta un DTO válido y lo convierte en instancia', async () => {
    const result: unknown = await createValidationPipe().transform(
      { email: 'ana@example.com', address: { street: 'Sol' } },
      metadata,
    );
    expect(result).toBeInstanceOf(SampleDto);
  });

  it('rechaza propiedades no declaradas (mass assignment)', async () => {
    const response = await rejectionOf({
      email: 'ana@example.com',
      address: { street: 'Sol' },
      role: 'ADMIN',
    });
    expect(response.code).toBe('VALIDATION_FAILED');
    expect(response.details).toEqual([expect.objectContaining({ field: 'role' })]);
  });

  it('informa cada campo inválido, incluidos los anidados', async () => {
    const response = await rejectionOf({
      email: 'no-es-email',
      address: { street: 'demasiado larga' },
    });
    const fields = (response.details as Array<{ field: string }>).map((detail) => detail.field);
    expect(fields).toEqual(['email', 'address.street']);
  });
});
