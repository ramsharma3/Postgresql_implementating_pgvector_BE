import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseContext } from './database-context';

@Injectable()
export class PgVectorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PgVectorService.name);
  private masterPool: Pool;
  private pools = new Map<string, Pool>();
  private defaultDb: string;
  private dbHost: string;
  private dbPort: number;
  private dbUser: string;
  private dbPass: string;

  constructor(private readonly configService: ConfigService) {
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (dbUrl) {
      try {
        const url = new URL(dbUrl);
        this.dbHost = url.hostname;
        this.dbPort = url.port ? parseInt(url.port, 10) : 5432;
        this.dbUser = url.username;
        this.dbPass = decodeURIComponent(url.password);
        this.defaultDb = url.pathname.slice(1) || 'kg_explorer';
      } catch (err: any) {
        this.logger.error(`Failed to parse DATABASE_URL: ${err.message}. Falling back to individual PG_ variables.`);
        this.loadFromIndividualEnv();
      }
    } else {
      this.loadFromIndividualEnv();
    }

    // Master pool connected to 'postgres' system database to run CREATE DATABASE DDLs
    this.masterPool = new Pool({
      host: this.dbHost,
      port: this.dbPort,
      user: this.dbUser,
      password: this.dbPass,
      database: 'postgres',
      connectionTimeoutMillis: 5000,
      ssl: this.configService.get<string>('DATABASE_URL') ? { rejectUnauthorized: false } : false,
    });
  }

  private loadFromIndividualEnv() {
    this.dbHost = this.configService.get<string>('PG_HOST', 'localhost');
    this.dbPort = this.configService.get<number>('PG_PORT', 5432);
    this.dbUser = this.configService.get<string>('PG_USER', 'postgres');
    this.dbPass = this.configService.get<string>('PG_PASSWORD', 'postgres123');
    this.defaultDb = this.configService.get<string>('PG_DATABASE', 'kg_explorer');
  }

  async onApplicationBootstrap() {
    this.logger.log('Dynamic PG Vector Service initialized. Pre-warming default database...');
    try {
      await this.getPool('default');
    } catch (err: any) {
      this.logger.error(`Failed to pre-warm default database: ${err.message}`);
    }
  }

  async getPool(networkId: string = 'default'): Promise<Pool> {
    const cleanId = networkId.trim();
    if (this.pools.has(cleanId)) {
      return this.pools.get(cleanId)!;
    }

    // Sanitize DB Name
    const dbSuffix = cleanId === 'default' ? '' : `_${cleanId.replace(/[^a-zA-Z0-9_]/g, '')}`;
    const dbName = `${this.defaultDb}${dbSuffix}`;

    this.logger.log(`Resolving database pool for Network: "${cleanId}" -> DB: "${dbName}"`);

    // Verify / Create DB via master pool
    const checkDb = await this.masterPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (checkDb.rows.length === 0) {
      this.logger.log(`Database "${dbName}" does not exist. Creating dynamically...`);
      // CREATE DATABASE cannot run inside a transaction or via parameterized datname
      await this.masterPool.query(`CREATE DATABASE ${dbName}`);
      this.logger.log(`Database "${dbName}" successfully created.`);
    }

    // Connect to the specific database
    const pool = new Pool({
      host: this.dbHost,
      port: this.dbPort,
      user: this.dbUser,
      password: this.dbPass,
      database: dbName,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: this.configService.get<string>('DATABASE_URL') ? { rejectUnauthorized: false } : false,
    });

    // Initialize Schema DDL
    try {
      this.logger.log(`Bootstrapping schemas and vector extensions on database "${dbName}"...`);
      const schemaSql = this.getInitializeSchemaSql();
      await pool.query(schemaSql);

      // Verify/Create HNSW index
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS node_embeddings_hnsw_idx ON node_embeddings 
          USING hnsw (embedding vector_cosine_ops);
        `);
      } catch (indexError: any) {
        this.logger.warn(`Failed to create HNSW index on ${dbName}, attempting IVFFlat: ${indexError.message}`);
        try {
          await pool.query(`
            CREATE INDEX IF NOT EXISTS node_embeddings_ivf_idx ON node_embeddings 
            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
          `);
        } catch (ivfError: any) {
          this.logger.warn(`Failed to create IVFFlat index on ${dbName}: ${ivfError.message}`);
        }
      }

      this.pools.set(cleanId, pool);
      return pool;

    } catch (err: any) {
      this.logger.error(`Failed to bootstrap schema on database "${dbName}": ${err.message}`, err.stack);
      await pool.end();
      throw err;
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    const networkId = DatabaseContext.getNetworkId();
    const pool = await this.getPool(networkId);
    return pool.query(text, params);
  }

  async upsertDocument(id: string, title: string, summary: string, type: string, embedding: number[]): Promise<void> {
    const embeddingString = `[${embedding.join(',')}]`;
    const queryText = `
      INSERT INTO node_embeddings (id, title, summary, type, embedding)
      VALUES ($1, $2, $3, $4, $5::vector)
      ON CONFLICT (id) DO UPDATE 
      SET title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          type = EXCLUDED.type,
          embedding = EXCLUDED.embedding;
    `;
    const networkId = DatabaseContext.getNetworkId();
    const pool = await this.getPool(networkId);
    await pool.query(queryText, [id, title, summary || '', type, embeddingString]);
  }

  async vectorSearch(embedding: number[], limit = 10): Promise<Array<{ id: string; title: string; summary: string; type: string; score: number }>> {
    const embeddingString = `[${embedding.join(',')}]`;
    const queryText = `
      SELECT id, title, summary, type, 1 - (embedding <=> $1::vector) AS score
      FROM node_embeddings
      ORDER BY embedding <=> $1::vector
      LIMIT $2;
    `;
    const networkId = DatabaseContext.getNetworkId();
    const pool = await this.getPool(networkId);
    const res = await pool.query(queryText, [embeddingString, limit]);
    return res.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      type: row.type,
      score: parseFloat(row.score),
    }));
  }

  async clearAll(): Promise<void> {
    const networkId = DatabaseContext.getNetworkId();
    const pool = await this.getPool(networkId);
    await pool.query('DELETE FROM node_embeddings;');
  }

  private getInitializeSchemaSql(): string {
    return `
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS companies (
          id VARCHAR(100) PRIMARY KEY,
          name TEXT NOT NULL,
          type VARCHAR(50) NOT NULL CHECK (type IN ('CLIENT', 'PARTNER', 'VENDOR', 'INTERNAL_UNIT')),
          domain TEXT,
          website TEXT,
          color VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS developers (
          id VARCHAR(100) PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          role VARCHAR(50) NOT NULL CHECK (role IN ('AI_ENGINEER', 'FULLSTACK_DEV', 'DATA_SCIENTIST', 'DEVOPS_LEAD', 'BACKEND_ENGINEER')),
          experience_level VARCHAR(50) NOT NULL CHECK (experience_level IN ('JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL')),
          availability DOUBLE PRECISION,
          color VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(100) PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status VARCHAR(50) NOT NULL CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'PROPOSED')),
          repository_url TEXT,
          start_date DATE,
          color VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS documents (
          id VARCHAR(100) PRIMARY KEY,
          title TEXT NOT NULL,
          doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('ADR', 'SPEC', 'GUIDE', 'POSTMORTEM', 'PAPER')),
          content TEXT,
          summary TEXT,
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          color VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS technologies (
          id VARCHAR(100) PRIMARY KEY,
          name TEXT NOT NULL,
          category VARCHAR(50) NOT NULL CHECK (category IN ('TOOL', 'FRAMEWORK', 'DATABASE', 'LLM', 'CLOUD')),
          license VARCHAR(100),
          version VARCHAR(50),
          description TEXT,
          color VARCHAR(50),
          language VARCHAR(100),
          ecosystem VARCHAR(100),
          data_model VARCHAR(100),
          supports_vector_native BOOLEAN,
          provider VARCHAR(100),
          context_window INTEGER,
          is_multimodal BOOLEAN,
          cost_per_1k_input_tokens DOUBLE PRECISION,
          cost_per_1k_output_tokens DOUBLE PRECISION,
          service_type VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS node_embeddings (
          id VARCHAR(100) PRIMARY KEY,
          title TEXT NOT NULL,
          summary TEXT,
          type VARCHAR(50) NOT NULL,
          embedding vector(1536)
      );

      CREATE TABLE IF NOT EXISTS developer_company (
          developer_id VARCHAR(100) REFERENCES developers(id) ON DELETE CASCADE,
          company_id VARCHAR(100) REFERENCES companies(id) ON DELETE CASCADE,
          since DATE,
          department TEXT,
          PRIMARY KEY (developer_id, company_id)
      );

      CREATE TABLE IF NOT EXISTS company_project (
          company_id VARCHAR(100) REFERENCES companies(id) ON DELETE CASCADE,
          project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
          contract_id VARCHAR(100),
          budget DOUBLE PRECISION,
          PRIMARY KEY (company_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS developer_project (
          developer_id VARCHAR(100) REFERENCES developers(id) ON DELETE CASCADE,
          project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
          relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('WORKS_ON', 'LEADS')),
          role TEXT,
          allocated_hours INTEGER,
          assigned_at DATE,
          PRIMARY KEY (developer_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS project_technology (
          project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
          technology_id VARCHAR(100) REFERENCES technologies(id) ON DELETE CASCADE,
          environment VARCHAR(100),
          purpose TEXT,
          PRIMARY KEY (project_id, technology_id)
      );

      CREATE TABLE IF NOT EXISTS developer_technology (
          developer_id VARCHAR(100) REFERENCES developers(id) ON DELETE CASCADE,
          technology_id VARCHAR(100) REFERENCES technologies(id) ON DELETE CASCADE,
          proficiency VARCHAR(50) CHECK (proficiency IN ('BEGINNER', 'INTERMEDIATE', 'EXPERT')),
          years_exp INTEGER,
          PRIMARY KEY (developer_id, technology_id)
      );

      CREATE TABLE IF NOT EXISTS developer_document (
          developer_id VARCHAR(100) REFERENCES developers(id) ON DELETE CASCADE,
          document_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
          authored_at TIMESTAMP,
          PRIMARY KEY (developer_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS project_document (
          project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
          document_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
          relevance DOUBLE PRECISION,
          PRIMARY KEY (project_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS document_document (
          source_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
          target_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
          relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('EXTENDS', 'REFERS_TO')),
          PRIMARY KEY (source_id, target_id)
      );

      CREATE TABLE IF NOT EXISTS project_cloud (
          project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
          cloud_id VARCHAR(100) REFERENCES technologies(id) ON DELETE CASCADE,
          region VARCHAR(100),
          tier VARCHAR(50),
          PRIMARY KEY (project_id, cloud_id)
      );

      CREATE TABLE IF NOT EXISTS technology_integration (
          source_id VARCHAR(100) REFERENCES technologies(id) ON DELETE CASCADE,
          target_id VARCHAR(100) REFERENCES technologies(id) ON DELETE CASCADE,
          protocol VARCHAR(100),
          pattern VARCHAR(100),
          PRIMARY KEY (source_id, target_id)
      );
    `.trim();
  }
}
