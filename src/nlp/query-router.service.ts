import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { IntentClassifierService } from './intent-classifier.service';
import { EntityExtractorService } from './entity-extractor.service';
import { RelationDetectorService } from './relation-detector.service';
import { SqlQueryGeneratorService } from './sql-query-generator.service';
import { TelemetryService } from './telemetry.service';
import { PgVectorService } from '../database/pg-vector.service';

export interface NlpQueryResult {
  classification: { intent: string; confidence: number };
  entities: Array<{ entity: string; type: string; id: string; confidence: number }>;
  relation: { relationship: string | null; confidence: number };
  query: string;
  params: any[];
  graph: any;
  rawRecords: any[];
  needsDisambiguation?: boolean;
  ambiguousTerm?: string;
  disambiguationOptions?: any[];
}

export type SqlRegeneratorFn = (
  question: string,
  failedSql: string,
  errorMessage: string,
) => Promise<{ query: string; params: any[] }>;

function validateReadOnlySql(sql: string): void {
  const upper = sql.toUpperCase();
  if (
    upper.includes('INSERT ') ||
    upper.includes('UPDATE ') ||
    upper.includes('DELETE ') ||
    upper.includes('DROP ') ||
    upper.includes('ALTER ') ||
    upper.includes('CREATE ') ||
    upper.includes('TRUNCATE ')
  ) {
    throw new BadRequestException('Write operations are forbidden.');
  }
}

@Injectable()
export class QueryRouterService {
  private readonly logger = new Logger(QueryRouterService.name);
  private translationCache = new Map<string, NlpQueryResult>();
  private regeneratorFn: SqlRegeneratorFn | null = null;

  constructor(
    private readonly classifier: IntentClassifierService,
    private readonly extractor: EntityExtractorService,
    private readonly detector: RelationDetectorService,
    private readonly generator: SqlQueryGeneratorService,
    private readonly telemetryService: TelemetryService,
    private readonly pgVectorService: PgVectorService,
  ) {}

  registerRegenerator(fn: SqlRegeneratorFn): void {
    this.logger.log('Registered dynamic AI query regenerator callback.');
    this.regeneratorFn = fn;
  }

  async processQuery(question: string, queryEmbedding?: number[]): Promise<NlpQueryResult> {
    const normalizedKey = question.toLowerCase().trim();
    if (this.translationCache.has(normalizedKey)) {
      const cached = this.translationCache.get(normalizedKey)!;
      this.logger.log(`Cache hit for query: "${question}"`);
      // Log cached query telemetry
      this.telemetryService.logQuery({
        question,
        mode: 'nlp',
        cypher: cached.query,
        executionTimeMs: 0,
        success: true,
        nodesCount: cached.graph.nodes.length,
        relationshipsCount: cached.graph.links.length,
      });
      return cached;
    }

    const startTime = Date.now();
    this.logger.log(`Processing NLP pipeline query: "${question}"`);

    // 1. Run Entity Extraction with Disambiguation Check
    const extractionRes = this.extractor.extractWithDisambiguation(question);
    if (extractionRes.ambiguousTerm) {
      const record = {
        needsDisambiguation: true,
        ambiguousTerm: extractionRes.ambiguousTerm,
        disambiguationOptions: extractionRes.disambiguationOptions,
        classification: { intent: 'DISAMBIGUATE', confidence: 1.0 },
        entities: [],
        relation: { relationship: null, confidence: 0 },
        query: '',
        params: [],
        graph: { nodes: [], links: [] },
        rawRecords: [],
      };
      
      this.telemetryService.logQuery({
        question,
        mode: 'nlp',
        cypher: 'DISAMBIGUATION_FLOW',
        executionTimeMs: Date.now() - startTime,
        success: true,
        nodesCount: 0,
        relationshipsCount: 0,
      });
      
      return record;
    }

    const entities = extractionRes.entities;

    // 2. Run Intent Classification (Support embedding or heuristic fallback)
    const classification = this.classifier.classify(question, queryEmbedding);

    // 3. Run Relationship Detection
    const relation = this.detector.detect(question);

    this.logger.log(
      `NLP Pipeline Matches - Intent: ${classification.intent} (${classification.confidence}), ` +
      `Entities found: ${entities.length}, Relationship: ${relation.relationship} (${relation.confidence})`
    );

    // Graceful check if query cannot be parsed
    if (classification.confidence < 0.4 && entities.length === 0) {
      throw new BadRequestException(
        "I couldn't classify your search request. Try asking something like: " +
        "'Show developers skilled in Docker', 'Which projects use Redis?', or 'Who leads the customer agent project?'"
      );
    }

    // 4. Generate Parameterized SQL
    let { query, params } = this.generator.generate(
      classification.intent,
      entities,
      relation.relationship,
    );

    let rawResult: any = null;
    let success = false;
    let errorMessage: string | undefined;

    try {
      // 5. Strict Read-Only Guard
      validateReadOnlySql(query);

      // 6. Execute PostgreSQL query
      rawResult = await this.pgVectorService.query(query, params);
      success = true;
    } catch (err: any) {
      errorMessage = err.message;
      this.logger.warn(`Query execution failed: ${errorMessage}. Retrying self-healing regeneration...`);

      // 7. Self-Healing Query Regeneration (Retry Once)
      if (this.regeneratorFn) {
        try {
          const healed = await this.regeneratorFn(question, query, errorMessage!);
          this.logger.log(`Healed SQL generated by LLM: "${healed.query}"`);
          
          validateReadOnlySql(healed.query);

          rawResult = await this.pgVectorService.query(healed.query, healed.params);
          query = healed.query;
          params = healed.params;
          success = true;
          errorMessage = undefined;
          this.logger.log('Self-healing regeneration query execution succeeded!');
        } catch (retryErr: any) {
          this.logger.error(`Self-healing query regeneration failed: ${retryErr.message}`);
          errorMessage = `${errorMessage} | Retry error: ${retryErr.message}`;
        }
      }
    }

    // 8. Safe fallback neighborhood query if execution failed
    if (!success || !rawResult) {
      this.logger.warn('Executing emergency safe fallback neighborhood query...');
      try {
        if (entities.length > 0) {
          const entityId = entities[0].id;
          params = [entityId];
          query = `
            SELECT 
              json_build_object('id', d.id, 'label', 'Developer', 'name', d.name) AS source_node, 
              NULL::json AS target_node, 
              NULL::json AS link 
            FROM developers d WHERE d.id = $1
            UNION ALL
            SELECT 
              json_build_object('id', p.id, 'label', 'Project', 'name', p.name) AS source_node, 
              NULL::json AS target_node, 
              NULL::json AS link 
            FROM projects p WHERE p.id = $1
            UNION ALL
            SELECT 
              json_build_object('id', c.id, 'label', 'Company', 'name', c.name) AS source_node, 
              NULL::json AS target_node, 
              NULL::json AS link 
            FROM companies c WHERE c.id = $1;
          `;
          rawResult = await this.pgVectorService.query(query, params);
        } else {
          params = [];
          query = `SELECT json_build_object('id', p.id, 'label', 'Project', 'name', p.name) AS source_node, NULL::json AS target_node, NULL::json AS link FROM projects p LIMIT 10;`;
          rawResult = await this.pgVectorService.query(query, params);
        }
        success = true;
      } catch (fallbackErr: any) {
        this.logger.error(`Emergency fallback query failed: ${fallbackErr.message}`);
        throw new BadRequestException(`Failed to execute query search: ${errorMessage}`);
      }
    }

    // 9. Parse and assemble response into GraphNode / GraphLink format
    const nodesMap = new Map<string, any>();
    const linksMap = new Map<string, any>();
    const rawRecords = rawResult.rows || [];

    for (const row of rawRecords) {
      if (row.source_node) {
        nodesMap.set(row.source_node.id, row.source_node);
      }
      if (row.target_node) {
        nodesMap.set(row.target_node.id, row.target_node);
      }
      if (row.link) {
        linksMap.set(row.link.id, row.link);
      }
    }

    const graph = {
      nodes: Array.from(nodesMap.values()),
      links: Array.from(linksMap.values()),
    };

    const result: NlpQueryResult = {
      classification,
      entities,
      relation,
      query,
      params,
      graph,
      rawRecords,
    };

    // Save translation to cache
    if (this.translationCache.size > 500) {
      this.translationCache.clear();
    }
    this.translationCache.set(normalizedKey, result);

    // Record Query Telemetry (map SQL to 'cypher' property)
    const latency = Date.now() - startTime;
    this.telemetryService.logQuery({
      question,
      mode: this.regeneratorFn ? 'llm_fallback' : 'nlp',
      cypher: query,
      executionTimeMs: latency,
      success,
      nodesCount: graph.nodes.length,
      relationshipsCount: graph.links.length,
      errorMessage,
    });

    return result;
  }
}
