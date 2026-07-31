import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetGraphQueryDto {
  @ApiPropertyOptional({ description: 'Maximum number of nodes/relationships to return', default: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 300;

  @ApiPropertyOptional({ description: 'Optional label filter (e.g. Project, Developer, Document)' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class GetNeighborsQueryDto {
  @ApiPropertyOptional({ description: 'Hop depth for neighborhood search (1 or 2)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  depth?: number = 1;
}
