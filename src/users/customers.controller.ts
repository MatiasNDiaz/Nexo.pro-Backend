import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DataSource } from 'typeorm';
import { AllowAccountStates, type AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CustomerProfile } from './entities/customer-profile.entity';

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 300,
    description: 'Datos útiles para el profesional',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  extraInfo?: string | null;
}

export class CustomerProfileDto {
  @ApiProperty({ nullable: true, type: String }) extraInfo: string | null;
}

/** Datos del cliente que no son de identidad. La dirección llega en la etapa 8. */
@ApiTags('customers')
@ApiCookieAuth()
@Roles('CUSTOMER')
@AllowAccountStates('PENDING_VERIFICATION', 'ACTIVE')
@Controller({ path: 'customers/me', version: '1' })
export class CustomersController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({ type: CustomerProfileDto })
  async me(@CurrentUser() user: AuthUser): Promise<CustomerProfileDto> {
    const profile = await this.dataSource
      .getRepository(CustomerProfile)
      .findOneBy({ userId: user.id });
    return { extraInfo: profile?.extraInfo ?? null };
  }

  @Patch()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: CustomerProfileDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileDto> {
    const extraInfo = dto.extraInfo === undefined ? undefined : dto.extraInfo || null;
    if (extraInfo !== undefined) {
      await this.dataSource
        .getRepository(CustomerProfile)
        .upsert({ userId: user.id, extraInfo }, ['userId']);
    }
    return this.me(user);
  }
}
