import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiErrorDetail } from '../errors/api-error';

/**
 * ValidationPipe global: descarta y rechaza propiedades no declaradas en el DTO (mass assignment)
 * y responde con el formato de error de la API, campo por campo.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Los datos enviados no son válidos.',
        details: flatten(errors),
      }),
  });
}

function flatten(errors: ValidationError[], parent = ''): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}
