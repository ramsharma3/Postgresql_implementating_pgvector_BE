import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve high-level knowledge graph metrics and topology distribution' })
  @ApiResponse({ status: 200, description: 'Knowledge graph metrics payload' })
  async getStats() {
    const data = await this.statsService.getStats();
    return {
      success: true,
      data,
    };
  }
}
