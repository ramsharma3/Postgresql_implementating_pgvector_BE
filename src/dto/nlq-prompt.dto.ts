import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NlqQueryDto {
  @ApiProperty({
    description: 'Natural language question or prompt',
    example: 'Which Senior AI Engineers are skilled in Neo4j and available?',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  prompt?: string;

  @ApiProperty({
    description: 'Natural language question',
    example: 'Who is leading the LLM projects?',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  question?: string;

  @ApiProperty({
    description: 'Query search execution mode',
    example: 'cypher',
    enum: ['cypher', 'hybrid'],
    required: false,
  })
  @IsOptional()
  @IsString()
  mode?: 'cypher' | 'hybrid';
}
