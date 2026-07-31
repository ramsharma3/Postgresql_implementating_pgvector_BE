import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LlmService } from './llm.service';
import { NlqQueryDto } from '../dto/nlq-prompt.dto';

@ApiTags('Query')
@Controller('query')
export class QueryController {
  constructor(private readonly llmService: LlmService) {}

  @Post()
  @ApiOperation({ summary: 'Natural Language to Cypher translation & execution via Gemini 1.5 Flash' })
  @ApiResponse({ status: 200, description: 'Generated Cypher, explanation, tabular records, and visual graph' })
  @ApiResponse({ status: 400, description: 'Missing prompt or question parameter' })
  @ApiResponse({ status: 422, description: 'Gemini translation failure or unsafe Cypher' })
  async handleNaturalLanguageQuery(@Body() dto: NlqQueryDto) {
    const prompt = dto.prompt || dto.question;
    if (!prompt) {
      throw new BadRequestException('Request body must contain either a "prompt" or "question" field.');
    }

    // Auto-detect mode based on semantic query keywords (e.g. document, summary, rag) or explicit mode param
    const mode = dto.mode || (prompt.toLowerCase().includes('document') || prompt.toLowerCase().includes('summary') || prompt.toLowerCase().includes('rag') ? 'hybrid' : 'cypher');

    const data = mode === 'hybrid'
      ? await this.llmService.hybridSearch(prompt)
      : await this.llmService.translateAndExecute(prompt);

    return {
      success: true,
      data,
      ...data,
    };
  }
}
