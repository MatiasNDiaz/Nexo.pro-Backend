import { Module } from '@nestjs/common';
import { ProfessionsController } from './professions.controller';

@Module({ controllers: [ProfessionsController] })
export class ProfessionsModule {}
