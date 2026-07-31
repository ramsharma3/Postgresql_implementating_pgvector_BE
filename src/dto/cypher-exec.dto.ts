import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecuteCypherDto {
  @ApiProperty({
    description: 'Read-only Cypher query statement',
    example: "MATCH (d:Developer)-[:SKILLED_IN]->(t:Technology {name: 'Neo4j'}) RETURN d.name, d.role LIMIT 20",
  })
  @IsNotEmpty()
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: 'Optional query parameters map',
    example: { limit: 20 },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}
