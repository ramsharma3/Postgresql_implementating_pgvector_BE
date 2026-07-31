import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PgVectorService } from '../database/pg-vector.service';

@ApiTags('Operations')
@Controller('health')
export class HealthController {
  constructor(private readonly pgVectorService: PgVectorService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness & Readiness probe for PostgreSQL and System Health' })
  @ApiResponse({ status: 200, description: 'System and PostgreSQL connectivity healthy' })
  @ApiResponse({ status: 503, description: 'PostgreSQL connection error' })
  async getHealth() {
    try {
      await this.pgVectorService.query('SELECT 1');
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        info: {
          database: {
            status: 'healthy',
            type: 'PostgreSQL + pgvector',
          },
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'PostgreSQL Database connection unavailable',
          details: error.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
