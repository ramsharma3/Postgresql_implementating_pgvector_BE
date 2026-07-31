import { Injectable, Logger } from '@nestjs/common';
import { PgVectorService } from '../database/pg-vector.service';

@Injectable()
export class StatsRepository {
  private readonly logger = new Logger(StatsRepository.name);

  constructor(private readonly pgVectorService: PgVectorService) {}

  async fetchTotalNodes(): Promise<number> {
    const query = `
      SELECT (
        (SELECT COUNT(*) FROM companies) +
        (SELECT COUNT(*) FROM developers) +
        (SELECT COUNT(*) FROM projects) +
        (SELECT COUNT(*) FROM documents) +
        (SELECT COUNT(*) FROM technologies)
      ) AS total;
    `;
    const res = await this.pgVectorService.query(query);
    return parseInt(res.rows[0].total, 10);
  }

  async fetchTotalRelationships(): Promise<number> {
    const query = `
      SELECT (
        (SELECT COUNT(*) FROM developer_company) +
        (SELECT COUNT(*) FROM company_project) +
        (SELECT COUNT(*) FROM developer_project) +
        (SELECT COUNT(*) FROM project_technology) +
        (SELECT COUNT(*) FROM developer_technology) +
        (SELECT COUNT(*) FROM developer_document) +
        (SELECT COUNT(*) FROM project_document) +
        (SELECT COUNT(*) FROM document_document) +
        (SELECT COUNT(*) FROM project_cloud) +
        (SELECT COUNT(*) FROM technology_integration)
      ) AS total;
    `;
    const res = await this.pgVectorService.query(query);
    return parseInt(res.rows[0].total, 10);
  }

  async fetchNodesByLabel(): Promise<Record<string, number>> {
    const query = `
      SELECT 'Company' AS label, COUNT(*) AS count FROM companies
      UNION ALL
      SELECT 'Developer', COUNT(*) FROM developers
      UNION ALL
      SELECT 'Project', COUNT(*) FROM projects
      UNION ALL
      SELECT 'Document', COUNT(*) FROM documents
      UNION ALL
      SELECT 
        CASE 
          WHEN category = 'FRAMEWORK' THEN 'Framework'
          WHEN category = 'DATABASE' THEN 'Database'
          WHEN category = 'LLM' THEN 'LLM'
          WHEN category = 'CLOUD' THEN 'Cloud'
          ELSE 'Technology'
        END AS label, 
        COUNT(*) AS count 
      FROM technologies 
      GROUP BY 
        CASE 
          WHEN category = 'FRAMEWORK' THEN 'Framework'
          WHEN category = 'DATABASE' THEN 'Database'
          WHEN category = 'LLM' THEN 'LLM'
          WHEN category = 'CLOUD' THEN 'Cloud'
          ELSE 'Technology'
        END;
    `;
    
    const res = await this.pgVectorService.query(query);
    const result: Record<string, number> = {};
    
    for (const row of res.rows) {
      const count = parseInt(row.count, 10);
      if (count > 0) {
        result[row.label] = count;
      }
    }
    
    return result;
  }

  async fetchRelationshipsByType(): Promise<Record<string, number>> {
    const query = `
      SELECT 'BELONGS_TO' AS label, COUNT(*) AS count FROM developer_company
      UNION ALL
      SELECT 'COMMISSIONED', COUNT(*) FROM company_project
      UNION ALL
      SELECT relationship_type AS label, COUNT(*) FROM developer_project GROUP BY relationship_type
      UNION ALL
      SELECT 'USES_TECH', COUNT(*) FROM project_technology
      UNION ALL
      SELECT 'SKILLED_IN', COUNT(*) FROM developer_technology
      UNION ALL
      SELECT 'AUTHORED', COUNT(*) FROM developer_document
      UNION ALL
      SELECT 'REFERENCES_DOC', COUNT(*) FROM project_document
      UNION ALL
      SELECT 'EXTENDS_DOC', COUNT(*) FROM document_document
      UNION ALL
      SELECT 'DEPLOYS_TO', COUNT(*) FROM project_cloud
      UNION ALL
      SELECT 'INTEGRATES_WITH', COUNT(*) FROM technology_integration;
    `;

    const res = await this.pgVectorService.query(query);
    const result: Record<string, number> = {};

    for (const row of res.rows) {
      const count = parseInt(row.count, 10);
      if (count > 0) {
        result[row.label] = (result[row.label] || 0) + count;
      }
    }

    return result;
  }
}
