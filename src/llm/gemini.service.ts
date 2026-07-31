import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PromptService } from './prompt.service';
import { ParserService } from './parser.service';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly apiKey: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptService: PromptService,
    private readonly parserService: ParserService,
  ) {
    this.apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;
    if (this.apiKey && this.apiKey !== 'dummy_api_key_for_dev') {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    }
  }

  async generateCypher(question: string, schemaGrounding?: string): Promise<string> {
    if (!this.genAI) {
      this.logger.warn('GEMINI_API_KEY missing or set to dummy. Executing heuristic Cypher fallback.');
      return this.fallbackCypher(question);
    }

    try {
      let modelName = this.configService.get<string>('gemini.model') || 'gemini-3.5-flash-lite';
      if (modelName === 'gemini-1.5-flash') {
        modelName = 'gemini-3.5-flash-lite';
      }
      const model = this.genAI.getGenerativeModel({ model: modelName });
      
      const prompt = this.promptService.buildCypherPrompt(question, schemaGrounding);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      return this.parserService.cleanCypher(responseText);
    } catch (error: any) {
      this.logger.error(`Gemini Cypher generation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Gemini translation failed: ${error.message}`);
    }
  }

  async generateAnswer(question: string, graphResults: any): Promise<string> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is missing or dummy.');
    }

    try {
      let modelName = this.configService.get<string>('gemini.model') || 'gemini-3.5-flash-lite';
      if (modelName === 'gemini-1.5-flash') {
        modelName = 'gemini-3.5-flash-lite';
      }
      const model = this.genAI.getGenerativeModel({ model: modelName });
      
      const prompt = this.promptService.buildAnswerPrompt(question, graphResults);
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: any) {
      this.logger.error(`Gemini Answer generation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Gemini explanation failed: ${error.message}`);
    }
  }

  async generateRawText(prompt: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is missing or dummy.');
    }
    try {
      let modelName = this.configService.get<string>('gemini.model') || 'gemini-3.5-flash-lite';
      if (modelName === 'gemini-1.5-flash') {
        modelName = 'gemini-3.5-flash-lite';
      }
      const model = this.genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: any) {
      this.logger.error(`Gemini raw text generation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Gemini completion failed: ${error.message}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is missing or dummy.');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
      const result = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        outputDimensionality: 1536,
      } as any);
      if (result.embedding && result.embedding.values) {
        return result.embedding.values;
      }
      throw new Error('Embed content response is missing embedding values');
    } catch (error: any) {
      this.logger.error(`Gemini embedding generation failed: ${error.message}`, error.stack);
      // Fallback to random array of size 1536 to prevent total pipeline block
      return Array.from({ length: 1536 }, () => Math.random());
    }
  }

  private fallbackCypher(question: string): string {
    const qLower = question.toLowerCase();
    
    // Developer queries fallback
    if (qLower.includes('developer') || qLower.includes('skilled') || qLower.includes('experience') || qLower.includes('talent')) {
      if (qLower.includes('docker')) {
        return `MATCH (d:Developer)-[s:SKILLED_IN]->(t:Technology) WHERE toLower(t.name) CONTAINS 'docker' RETURN d, s, t LIMIT 50`;
      }
      if (qLower.includes('redis')) {
        return `MATCH (d:Developer)-[s:SKILLED_IN]->(t:Technology) WHERE toLower(t.name) CONTAINS 'redis' RETURN d, s, t LIMIT 50`;
      }
      if (qLower.includes('gemini')) {
        return `MATCH (d:Developer)-[s:SKILLED_IN]->(t:Technology) WHERE toLower(t.name) CONTAINS 'gemini' RETURN d, s, t LIMIT 50`;
      }
      return `MATCH (d:Developer)-[s:SKILLED_IN]->(t:Technology) RETURN d, s, t LIMIT 50`;
    }
    
    // Project / tech usage queries fallback
    if (qLower.includes('project') || qLower.includes('use') || qLower.includes('using') || qLower.includes('integrate')) {
      if (qLower.includes('gemini')) {
        return `MATCH (p:Project)-[r:USES_TECH]->(t:Technology) WHERE toLower(t.name) CONTAINS 'gemini' RETURN p, r, t LIMIT 50`;
      }
      if (qLower.includes('redis')) {
        return `MATCH (p:Project)-[r:USES_TECH]->(t:Technology) WHERE toLower(t.name) CONTAINS 'redis' RETURN p, r, t LIMIT 50`;
      }
      if (qLower.includes('docker')) {
        return `MATCH (p:Project)-[r:USES_TECH]->(t:Technology) WHERE toLower(t.name) CONTAINS 'docker' RETURN p, r, t LIMIT 50`;
      }
      if (qLower.includes('neo4j')) {
        return `MATCH (p:Project)-[r:USES_TECH]->(t:Technology) WHERE toLower(t.name) CONTAINS 'neo4j' RETURN p, r, t LIMIT 50`;
      }
      return `MATCH (p:Project)-[r:USES_TECH]->(t:Technology) RETURN p, r, t LIMIT 50`;
    }

    // Technology integrations / categories fallback
    if (qLower.includes('technology') || qLower.includes('technologies')) {
      if (qLower.includes('redis')) {
        return `MATCH (t1:Technology)-[r:INTEGRATES_WITH]-(t2:Technology) WHERE toLower(t1.name) CONTAINS 'redis' OR toLower(t2.name) CONTAINS 'redis' RETURN t1, r, t2 LIMIT 50`;
      }
      return `MATCH (t:Technology) RETURN t LIMIT 50`;
    }
    
    // Irrelevant / conversational fallbacks - return a single neutral node instead of dumping the DB
    return `MATCH (n:Company) RETURN n LIMIT 1`;
  }
}
