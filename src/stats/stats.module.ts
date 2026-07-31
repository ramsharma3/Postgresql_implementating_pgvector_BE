import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsRepository } from '../repositories/stats.repository';

@Module({
  controllers: [StatsController],
  providers: [StatsService, StatsRepository],
  exports: [StatsService, StatsRepository],
})
export class StatsModule {}
