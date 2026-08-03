import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PgVectorService } from '../database/pg-vector.service';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(private readonly pgVectorService: PgVectorService) {}

  private parseCsv(content: string): Array<Record<string, string>> {
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if (char === '\n' || char === '\r') {
        if (inQuotes) {
          currentLine += char;
        } else {
          if (currentLine.trim()) {
            lines.push(currentLine);
          }
          currentLine = '';
        }
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine);
    }

    if (lines.length === 0) return [];
    
    const headers = this.splitCsvLine(lines[0]);
    const results: Array<Record<string, string>> = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.splitCsvLine(lines[i]);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
      });
      results.push(obj);
    }
    
    return results;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(currentVal);
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    result.push(currentVal);
    return result;
  }

  async ingestCompanies(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} companies...`);
    let count = 0;

    for (const r of records) {
      const { id, name, type, domain, website, color } = r;
      if (!id || !name || !type) continue;
      
      const query = `
        INSERT INTO companies (id, name, type, domain, website, color)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            type = EXCLUDED.type,
            domain = EXCLUDED.domain,
            website = EXCLUDED.website,
            color = EXCLUDED.color;
      `;
      await this.pgVectorService.query(query, [id, name, type.toUpperCase(), domain || null, website || null, color || null]);
      count++;
    }
    return count;
  }

  async ingestDevelopers(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} developers...`);
    let count = 0;

    for (const r of records) {
      const { id, name, email, role, availability, color } = r;
      const experience_level = r.experience_level || r.experienceLevel;
      
      if (!id || !name || !role || !experience_level) continue;

      const avail = availability ? parseFloat(availability) : null;

      const query = `
        INSERT INTO developers (id, name, email, role, experience_level, availability, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            experience_level = EXCLUDED.experience_level,
            availability = EXCLUDED.availability,
            color = EXCLUDED.color;
      `;
      await this.pgVectorService.query(query, [
        id, 
        name, 
        email || null, 
        role.toUpperCase(), 
        experience_level.toUpperCase(), 
        avail, 
        color || null
      ]);
      count++;
    }
    return count;
  }

  async ingestProjects(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} projects...`);
    let count = 0;

    for (const r of records) {
      const { id, name, description, status, color } = r;
      const repository_url = r.repository_url || r.repositoryUrl;
      const start_date = r.start_date || r.startDate;

      if (!id || !name || !status) continue;

      const sDate = start_date ? new Date(start_date) : null;

      const query = `
        INSERT INTO projects (id, name, description, status, repository_url, start_date, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            repository_url = EXCLUDED.repository_url,
            start_date = EXCLUDED.start_date,
            color = EXCLUDED.color;
      `;
      await this.pgVectorService.query(query, [
        id, 
        name, 
        description || null, 
        status.toUpperCase(), 
        repository_url || null, 
        sDate, 
        color || null
      ]);
      count++;
    }
    return count;
  }

  async ingestDocuments(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} documents...`);
    let count = 0;

    for (const r of records) {
      const { id, title, content, summary, color } = r;
      const doc_type = r.doc_type || r.docType;
      const created_at = r.created_at || r.createdAt;
      const updated_at = r.updated_at || r.updatedAt;

      if (!id || !title || !doc_type) continue;

      const cAt = created_at ? new Date(created_at) : new Date();
      const uAt = updated_at ? new Date(updated_at) : new Date();

      const query = `
        INSERT INTO documents (id, title, doc_type, content, summary, created_at, updated_at, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            doc_type = EXCLUDED.doc_type,
            content = EXCLUDED.content,
            summary = EXCLUDED.summary,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            color = EXCLUDED.color;
      `;
      await this.pgVectorService.query(query, [
        id, 
        title, 
        doc_type.toUpperCase(), 
        content || null, 
        summary || null, 
        cAt, 
        uAt, 
        color || null
      ]);
      count++;
    }
    return count;
  }

  async ingestTechnologies(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} technologies...`);
    let count = 0;

    for (const r of records) {
      const { 
        id, name, category, license, version, description, color, 
        language, ecosystem, provider
      } = r;
      const data_model = r.data_model || r.dataModel;
      const supports_vector_native = r.supports_vector_native || r.supportsVectorNative;
      const context_window = r.context_window || r.contextWindow;
      const is_multimodal = r.is_multimodal || r.isMultimodal;
      const cost_per_1k_input_tokens = r.cost_per_1k_input_tokens || r.costPer1kInputTokens;
      const cost_per_1k_output_tokens = r.cost_per_1k_output_tokens || r.costPer1kOutputTokens;
      const service_type = r.service_type || r.serviceType;

      if (!id || !name || !category) continue;

      let mappedCategory = category.toUpperCase();
      if (mappedCategory === 'DATABASE') mappedCategory = 'DATABASE';
      else if (mappedCategory === 'FRAMEWORK') mappedCategory = 'FRAMEWORK';
      else if (mappedCategory === 'LLM') mappedCategory = 'LLM';
      else if (mappedCategory === 'CLOUD') mappedCategory = 'CLOUD';
      else mappedCategory = 'TOOL';

      const supportsVec = supports_vector_native === 'true' || supports_vector_native === '1';
      const isMulti = is_multimodal === 'true' || is_multimodal === '1';
      const cWindow = context_window ? parseInt(context_window, 10) : null;
      const cInput = cost_per_1k_input_tokens ? parseFloat(cost_per_1k_input_tokens) : null;
      const cOutput = cost_per_1k_output_tokens ? parseFloat(cost_per_1k_output_tokens) : null;

      const query = `
        INSERT INTO technologies (
          id, name, category, license, version, description, color,
          language, ecosystem, data_model, supports_vector_native, provider,
          context_window, is_multimodal, cost_per_1k_input_tokens, cost_per_1k_output_tokens, service_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            category = EXCLUDED.category,
            license = EXCLUDED.license,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            color = EXCLUDED.color,
            language = EXCLUDED.language,
            ecosystem = EXCLUDED.ecosystem,
            data_model = EXCLUDED.data_model,
            supports_vector_native = EXCLUDED.supports_vector_native,
            provider = EXCLUDED.provider,
            context_window = EXCLUDED.context_window,
            is_multimodal = EXCLUDED.is_multimodal,
            cost_per_1k_input_tokens = EXCLUDED.cost_per_1k_input_tokens,
            cost_per_1k_output_tokens = EXCLUDED.cost_per_1k_output_tokens,
            service_type = EXCLUDED.service_type;
      `;
      
      await this.pgVectorService.query(query, [
        id, name, mappedCategory, license || null, version || null, description || null, color || null,
        language || null, ecosystem || null, data_model || null, supportsVec, provider || null,
        cWindow, isMulti, cInput, cOutput, service_type || null
      ]);
      count++;
    }
    return count;
  }

  async ingestRelationships(csvContent: string): Promise<number> {
    const records = this.parseCsv(csvContent);
    this.logger.log(`Ingesting ${records.length} relationships...`);
    let count = 0;

    for (const r of records) {
      const { source_id, target_id, relationship_type, properties } = r;
      if (!source_id || !target_id || !relationship_type) continue;

      let propsObj: Record<string, any> = {};
      try {
        if (properties && properties.trim() && properties !== '{}') {
          propsObj = JSON.parse(properties);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to parse properties JSON: "${properties}": ${err.message}`);
      }

      const type = relationship_type.toUpperCase();

      switch (type) {
        case 'BELONGS_TO':
          await this.pgVectorService.query(`
            INSERT INTO developer_company (developer_id, company_id, since, department)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (developer_id, company_id) DO UPDATE
            SET since = EXCLUDED.since, department = EXCLUDED.department;
          `, [
            source_id, 
            target_id, 
            propsObj.since ? new Date(propsObj.since) : null, 
            propsObj.department || null
          ]);
          break;

        case 'COMMISSIONED':
          await this.pgVectorService.query(`
            INSERT INTO company_project (company_id, project_id, contract_id, budget)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (company_id, project_id) DO UPDATE
            SET contract_id = EXCLUDED.contract_id, budget = EXCLUDED.budget;
          `, [
            source_id, 
            target_id, 
            propsObj.contractId || null, 
            propsObj.budget ? parseFloat(propsObj.budget) : null
          ]);
          break;

        case 'WORKS_ON':
        case 'LEADS':
          await this.pgVectorService.query(`
            INSERT INTO developer_project (developer_id, project_id, relationship_type, role, allocated_hours, assigned_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (developer_id, project_id) DO UPDATE
            SET relationship_type = EXCLUDED.relationship_type, role = EXCLUDED.role, allocated_hours = EXCLUDED.allocated_hours, assigned_at = EXCLUDED.assigned_at;
          `, [
            source_id, 
            target_id, 
            type, 
            propsObj.role || null, 
            propsObj.allocatedHours ? parseInt(propsObj.allocatedHours, 10) : null, 
            propsObj.assignedAt ? new Date(propsObj.assignedAt) : null
          ]);
          break;

        case 'USES_TECH':
          await this.pgVectorService.query(`
            INSERT INTO project_technology (project_id, technology_id, environment, purpose)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (project_id, technology_id) DO UPDATE
            SET environment = EXCLUDED.environment, purpose = EXCLUDED.purpose;
          `, [
            source_id, 
            target_id, 
            propsObj.environment || null, 
            propsObj.purpose || null
          ]);
          break;

        case 'SKILLED_IN':
          await this.pgVectorService.query(`
            INSERT INTO developer_technology (developer_id, technology_id, proficiency, years_exp)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (developer_id, technology_id) DO UPDATE
            SET proficiency = EXCLUDED.proficiency, years_exp = EXCLUDED.years_exp;
          `, [
            source_id, 
            target_id, 
            propsObj.proficiency ? propsObj.proficiency.toUpperCase() : null, 
            propsObj.yearsExp ? parseInt(propsObj.yearsExp, 10) : null
          ]);
          break;

        case 'AUTHORED':
          await this.pgVectorService.query(`
            INSERT INTO developer_document (developer_id, document_id, authored_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (developer_id, document_id) DO UPDATE
            SET authored_at = EXCLUDED.authored_at;
          `, [
            source_id, 
            target_id, 
            propsObj.authoredAt ? new Date(propsObj.authoredAt) : null
          ]);
          break;

        case 'REFERENCES_DOC':
          await this.pgVectorService.query(`
            INSERT INTO project_document (project_id, document_id, relevance)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, document_id) DO UPDATE
            SET relevance = EXCLUDED.relevance;
          `, [
            source_id, 
            target_id, 
            propsObj.relevance ? parseFloat(propsObj.relevance) : null
          ]);
          break;

        case 'EXTENDS_DOC':
          await this.pgVectorService.query(`
            INSERT INTO document_document (source_id, target_id, relationship_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (source_id, target_id) DO UPDATE
            SET relationship_type = EXCLUDED.relationship_type;
          `, [
            source_id, 
            target_id, 
            propsObj.relationshipType ? propsObj.relationshipType.toUpperCase() : 'REFERS_TO'
          ]);
          break;

        case 'DEPLOYS_TO':
          await this.pgVectorService.query(`
            INSERT INTO project_cloud (project_id, cloud_id, region, tier)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (project_id, cloud_id) DO UPDATE
            SET region = EXCLUDED.region, tier = EXCLUDED.tier;
          `, [
            source_id, 
            target_id, 
            propsObj.region || null, 
            propsObj.tier || null
          ]);
          break;

        case 'INTEGRATES_WITH':
          await this.pgVectorService.query(`
            INSERT INTO technology_integration (source_id, target_id, protocol, pattern)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (source_id, target_id) DO UPDATE
            SET protocol = EXCLUDED.protocol, pattern = EXCLUDED.pattern;
          `, [
            source_id, 
            target_id, 
            propsObj.protocol || null, 
            propsObj.pattern || null
          ]);
          break;

        default:
          this.logger.warn(`Skipping unknown relationship type: "${type}"`);
          continue;
      }
      count++;
    }
    return count;
  }
}
