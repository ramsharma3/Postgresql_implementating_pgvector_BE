import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GraphRepository } from '../repositories/graph.repository';
import { QueryRouterService } from '../nlp/query-router.service';
import { IntentClassifierService } from '../nlp/intent-classifier.service';
import { PgVectorService } from '../database/pg-vector.service';

@Injectable()
export class LlmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly graphRepository: GraphRepository,
    private readonly queryRouterService: QueryRouterService,
    private readonly intentClassifierService: IntentClassifierService,
    private readonly pgVectorService: PgVectorService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting background node embedding seeder task...');
    this.seedNodeEmbeddings().catch((err) => {
      this.logger.error('Failed to execute node embedding seeder:', err.message, err.stack);
    });

    this.logger.log('Seeding NLP classifier prototypes and registering AI self-healing...');
    try {
      await this.intentClassifierService.initializePrototypes(this.geminiService);
    } catch (err: any) {
      this.logger.error(`Failed to initialize semantic classifier prototypes: ${err.message}`);
    }

    // Register the SQL self-healing regenerator callback dynamically
    this.queryRouterService.registerRegenerator(async (q, failedSql, errMsg) => {
      return this.regenerateSqlWithLlm(q, failedSql, errMsg);
    });
  }

  async seedNodeEmbeddings() {
    this.logger.log('Running checking/seeding of all database node vector embeddings...');

    // 1. Process documents
    const docsRes = await this.pgVectorService.query(`SELECT id, title, summary FROM documents`);
    for (const doc of docsRes.rows) {
      const { id, title, summary } = doc;
      const check = await this.pgVectorService.query(`SELECT embedding FROM node_embeddings WHERE id = $1`, [id]);
      let embedding = check.rows[0]?.embedding;

      if (!embedding) {
        const textToEmbed = `Document Title: ${title}. Summary: ${summary}`;
        this.logger.log(`Generating missing embedding for Document node: "${id}"`);
        try {
          const generatedEmbedding = await this.geminiService.generateEmbedding(textToEmbed);
          await this.pgVectorService.upsertDocument(id, title, summary, 'Document', generatedEmbedding);
        } catch (err: any) {
          this.logger.warn(`Failed to generate/save embedding for Document "${id}": ${err.message}`);
          continue;
        }
      }
    }

    // 2. Process projects
    const projsRes = await this.pgVectorService.query(`SELECT id, name, description FROM projects`);
    for (const proj of projsRes.rows) {
      const { id, name, description } = proj;
      const check = await this.pgVectorService.query(`SELECT embedding FROM node_embeddings WHERE id = $1`, [id]);
      let embedding = check.rows[0]?.embedding;

      if (!embedding) {
        const textToEmbed = `Project Name: ${name}. Description: ${description}`;
        this.logger.log(`Generating missing embedding for Project node: "${id}"`);
        try {
          const generatedEmbedding = await this.geminiService.generateEmbedding(textToEmbed);
          await this.pgVectorService.upsertDocument(id, name, description, 'Project', generatedEmbedding);
        } catch (err: any) {
          this.logger.warn(`Failed to generate/save embedding for Project "${id}": ${err.message}`);
          continue;
        }
      }
    }

    this.logger.log('Finished checking/seeding all database node vector embeddings.');
  }

  async regenerateSqlWithLlm(question: string, failedSql: string, errorMessage: string): Promise<{ query: string; params: any[] }> {
    this.logger.log(`Running SQL AI query self-healing for: "${question}"`);
    const schemaSummary = `
Entity Tables:
- companies(id PRIMARY KEY, name, type CHECK(type IN('CLIENT','PARTNER','VENDOR','INTERNAL_UNIT')), domain, website, color)
- developers(id PRIMARY KEY, name, email, role CHECK(role IN('AI_ENGINEER','FULLSTACK_DEV','DATA_SCIENTIST','DEVOPS_LEAD','BACKEND_ENGINEER')), experience_level CHECK(experience_level IN('JUNIOR','MID','SENIOR','STAFF','PRINCIPAL')), availability, color)
- projects(id PRIMARY KEY, name, description, status CHECK(status IN('ACTIVE','MAINTENANCE','PROPOSED')), repository_url, start_date, color)
- documents(id PRIMARY KEY, title, doc_type CHECK(doc_type IN('ADR','SPEC','GUIDE','POSTMORTEM','PAPER')), content, summary, created_at, updated_at, color)
- technologies(id PRIMARY KEY, name, category CHECK(category IN('TOOL','FRAMEWORK','DATABASE','LLM','CLOUD')), license, version, description, color, language, ecosystem, data_model, supports_vector_native, provider, context_window, is_multimodal, cost_per_1k_input_tokens, cost_per_1k_output_tokens, service_type)

Join/Relationship Tables:
- developer_company(developer_id REFERENCES developers(id), company_id REFERENCES companies(id), since, department)
- company_project(company_id REFERENCES companies(id), project_id REFERENCES projects(id), contract_id, budget)
- developer_project(developer_id REFERENCES developers(id), project_id REFERENCES projects(id), relationship_type CHECK(relationship_type IN('WORKS_ON','LEADS')), role, allocated_hours, assigned_at)
- project_technology(project_id REFERENCES projects(id), technology_id REFERENCES technologies(id), environment, purpose)
- developer_technology(developer_id REFERENCES developers(id), technology_id REFERENCES technologies(id), proficiency, years_exp)
- developer_document(developer_id REFERENCES developers(id), document_id REFERENCES documents(id), authored_at)
- project_document(project_id REFERENCES projects(id), document_id REFERENCES documents(id), relevance)
- document_document(source_id REFERENCES documents(id), target_id REFERENCES documents(id), relationship_type CHECK(relationship_type IN('EXTENDS','REFERS_TO')))
- project_cloud(project_id REFERENCES projects(id), cloud_id REFERENCES technologies(id), region, tier)
- technology_integration(source_id REFERENCES technologies(id), target_id REFERENCES technologies(id), protocol, pattern)
`;

    const prompt = `
You are an expert PostgreSQL developer. An automated system generated a parameterized SQL query that failed execution.
Your task is to fix and regenerate the SQL query and return it in valid JSON format.

=== PostgreSQL Database Schema ===
${schemaSummary}

=== Context ===
User Question: "${question}"
Failed SQL Query: "${failedSql}"
Error Message: "${errorMessage}"

=== Requirements ===
1. Return a JSON object with two fields:
   "query": A valid SELECT query string. Use parameterized inputs e.g. $1, $2.
   "params": An array containing the parameter values corresponding to $1, $2, etc.
2. Ensure the query constructs source_node, target_node, and link columns using json_build_object.
3. Do NOT write any markdown blocks (like \`\`\`json), explanatory text, or preamble. Return the raw JSON object string directly.
4. Restrict query to read-only SELECT actions. No mutations are allowed.
    `.trim();

    try {
      const response = await this.geminiService.generateRawText(prompt);
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        query: parsed.query,
        params: parsed.params || [],
      };
    } catch (err: any) {
      this.logger.error(`AI SQL query self-healing generation failed: ${err.message}`);
      throw err;
    }
  }

  async translateAndExecute(prompt: string) {
    const startTime = Date.now();

    // 1. Generate query embedding vector for intent classification
    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await this.geminiService.generateEmbedding(prompt);
    } catch (err: any) {
      this.logger.warn(`Failed to generate query embedding for intent match: ${err.message}. Fallback to regex.`);
    }

    // 2. Process query programmatically using the modular NLP pipeline
    const nlpResult = await this.queryRouterService.processQuery(prompt, queryEmbedding);

    // Check if the query needs disambiguation choices
    if (nlpResult.needsDisambiguation) {
      return {
        needsDisambiguation: true,
        ambiguousTerm: nlpResult.ambiguousTerm,
        disambiguationOptions: nlpResult.disambiguationOptions,
        answer: `Multiple matches found for "${nlpResult.ambiguousTerm}". Please clarify which node you meant.`,
        explanation: `Multiple matches found for "${nlpResult.ambiguousTerm}". Please clarify which node you meant.`,
        cypher: '',
        generatedCypher: '',
        graph: { nodes: [], links: [] },
        executionTime: Date.now() - startTime,
        nodeCount: 0,
        relationshipCount: 0,
      };
    }

    const { query: sql, graph, rawRecords } = nlpResult;

    // 3. Generate natural language summary using Gemini
    let answer = '';
    try {
      answer = await this.geminiService.generateAnswer(prompt, rawRecords);
    } catch (err: any) {
      this.logger.warn(`Gemini summary generation failed/skipped: ${err.message}. Building programmatic list summary.`);
      
      const developers = graph.nodes.filter((n: any) => n.label === 'Developer');
      const projects = graph.nodes.filter((n: any) => n.label === 'Project');
      const techList = graph.nodes.filter(
        (n: any) =>
          n.label === 'Technology' ||
          n.label === 'LLM' ||
          n.label === 'Database' ||
          n.label === 'Framework' ||
          n.label === 'Cloud',
      );

      answer = `Retrieved matching nodes from graph:\n`;
      if (developers.length > 0) {
        answer += `- Found ${developers.length} Developers: ${developers.map((d: any) => d.name || d.id).join(', ')}\n`;
      }
      if (projects.length > 0) {
        answer += `- Found ${projects.length} Projects: ${projects.map((p: any) => p.name || p.id).join(', ')}\n`;
      }
      if (techList.length > 0) {
        answer += `- Found ${techList.length} Technologies: ${techList.map((t: any) => t.name || t.id).join(', ')}\n`;
      }
      if (graph.nodes.length === 0) {
        answer += `No matching entities found in the graph database.`;
      }
    }

    return {
      answer,
      explanation: answer,
      cypher: sql,
      generatedCypher: sql,
      graph,
      executionTime: Date.now() - startTime,
      nodeCount: graph.nodes.length,
      relationshipCount: graph.links.length,
    };
  }

  async hybridSearch(question: string) {
    const startTime = Date.now();
 
    // 1. Generate query embedding vector
    this.logger.log(`Generating embedding vector for query: "${question}"`);
    let queryVector: number[];
    try {
      queryVector = await this.geminiService.generateEmbedding(question);
    } catch (err: any) {
      this.logger.warn(`Failed to generate query embedding: ${err.message}. Returning error explanation.`);
      return {
        answer: 'Semantic Hybrid Search requires a valid GEMINI_API_KEY. Please configure the GEMINI_API_KEY environment variable to use semantic vector matches.',
        explanation: 'Semantic Hybrid Search requires a valid GEMINI_API_KEY. Please configure the GEMINI_API_KEY environment variable to use semantic vector matches.',
        cypher: '// Vector embedding generation failed due to missing credentials',
        generatedCypher: '// Vector embedding generation failed due to missing credentials',
        graph: { nodes: [], links: [] },
        executionTime: Date.now() - startTime,
        nodeCount: 0,
        relationshipCount: 0,
      };
    }
 
    // 2. Query similar Projects and Documents from PostgreSQL + pgvector
    let vectorMatches: Array<{ id: string; title: string; summary: string; type: string; score: number }> = [];
    try {
      vectorMatches = await this.pgVectorService.vectorSearch(queryVector, 10);
    } catch (err: any) {
      this.logger.error(`PostgreSQL vector search failed: ${err.message}. Falling back to empty matches.`);
    }

    const matchedNodeIds = vectorMatches.map((m) => m.id);
 
    if (matchedNodeIds.length === 0) {
      return {
        answer: 'No matching projects or documents were found in semantic vector search.',
        explanation: 'No matching projects or documents were found in semantic vector search.',
        cypher: 'Vector index returned 0 matching nodes',
        generatedCypher: 'Vector index returned 0 matching nodes',
        graph: { nodes: [], links: [] },
        executionTime: Date.now() - startTime,
        nodeCount: 0,
        relationshipCount: 0,
      };
    }
 
    // 3. Retrieve matching nodes and their surrounding sub-graph relations from Postgres
    const nodesMap = new Map<string, any>();
    const linksMap = new Map<string, any>();
    
    for (const id of matchedNodeIds) {
      const neighbors = await this.graphRepository.fetchNeighbors(id, 1);
      for (const n of neighbors.nodes) nodesMap.set(n.id, n);
      for (const l of neighbors.links) linksMap.set(l.id, l);
    }
    
    const graph = {
      nodes: Array.from(nodesMap.values()),
      links: Array.from(linksMap.values()),
    };
 
    // 4. Compile context from matches
    const projects = vectorMatches.filter((m) => m.type === 'Project');
    const documents = vectorMatches.filter((m) => m.type === 'Document');
    const projectsList = projects
      .map((p) => `Project Name: ${p.title}. Description: ${p.summary} (Score: ${p.score.toFixed(4)})`)
      .join('\n');
 
    const documentsList = documents
      .map((d) => `Document Title: ${d.title}. Summary: ${d.summary} (Score: ${d.score.toFixed(4)})`)
      .join('\n');
 
    const context = {
      semanticallySimilarProjects: projectsList || 'None matched',
      semanticallySimilarDocuments: documentsList || 'None matched',
    };
 
    // 5. Generate final answer from Gemini using the context
    const answer = await this.geminiService.generateAnswer(question, context);
 
    const executionTimeMs = Date.now() - startTime;
 
    const queryExplanation = `// 1. PostgreSQL pgvector Query:\n// SELECT id, title, summary, type, 1 - (embedding <=> :queryVector) AS score FROM node_embeddings ORDER BY score DESC LIMIT 10;\n\n// 2. PostgreSQL Subgraph Neighbors call: graphRepository.fetchNeighbors(id, 1)`;
 
    return {
      answer,
      explanation: answer,
      cypher: queryExplanation,
      generatedCypher: queryExplanation,
      graph,
      executionTime: executionTimeMs,
      nodeCount: graph.nodes.length,
      relationshipCount: graph.links.length,
    };
  }
}
