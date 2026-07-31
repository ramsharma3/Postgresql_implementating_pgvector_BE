import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { LlmService } from './llm.service';
import { GeminiService } from './gemini.service';
import { PromptService } from './prompt.service';
import { ParserService } from './parser.service';
import { GraphModule } from '../graph/graph.module';
import { NlpModule } from '../nlp/nlp.module';

@Module({
  imports: [GraphModule, NlpModule],
  controllers: [QueryController],
  providers: [LlmService, GeminiService, PromptService, ParserService],
  exports: [LlmService, GeminiService, PromptService, ParserService],
})
export class LlmModule {}
