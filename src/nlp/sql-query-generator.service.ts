import { Injectable, Logger } from '@nestjs/common';
import { ExtractedEntity } from './entity-extractor.service';

export interface GeneratedSqlQuery {
  query: string;
  params: any[];
}

@Injectable()
export class SqlQueryGeneratorService {
  private readonly logger = new Logger(SqlQueryGeneratorService.name);

  // Common SELECT fragments to build graph nodes in SQL directly
  private readonly SELECT_DEVELOPER = `
    json_build_object(
      'id', d.id,
      'label', 'Developer',
      'name', d.name,
      'properties', json_build_object(
        'id', d.id,
        'name', d.name,
        'email', d.email,
        'role', d.role,
        'experienceLevel', d.experience_level,
        'availability', d.availability,
        'color', d.color
      )
    )
  `;

  private readonly SELECT_COMPANY = `
    json_build_object(
      'id', c.id,
      'label', 'Company',
      'name', c.name,
      'properties', json_build_object(
        'id', c.id,
        'name', c.name,
        'type', c.type,
        'domain', c.domain,
        'website', c.website,
        'color', c.color
      )
    )
  `;

  private readonly SELECT_PROJECT = `
    json_build_object(
      'id', p.id,
      'label', 'Project',
      'name', p.name,
      'properties', json_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'status', p.status,
        'repositoryUrl', p.repository_url,
        'startDate', TO_CHAR(p.start_date, 'YYYY-MM-DD'),
        'color', p.color
      )
    )
  `;

  private readonly SELECT_DOCUMENT = `
    json_build_object(
      'id', doc.id,
      'label', 'Document',
      'name', doc.title,
      'properties', json_build_object(
        'id', doc.id,
        'title', doc.title,
        'docType', doc.doc_type,
        'content', doc.content,
        'summary', doc.summary,
        'createdAt', TO_CHAR(doc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updatedAt', TO_CHAR(doc.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'color', doc.color
      )
    )
  `;

  private readonly SELECT_TECHNOLOGY = `
    json_build_object(
      'id', t.id,
      'label', CASE 
        WHEN t.category = 'FRAMEWORK' THEN 'Framework'
        WHEN t.category = 'DATABASE' THEN 'Database'
        WHEN t.category = 'LLM' THEN 'LLM'
        WHEN t.category = 'CLOUD' THEN 'Cloud'
        ELSE 'Technology'
      END,
      'name', t.name,
      'properties', json_strip_nulls(json_build_object(
        'id', t.id,
        'name', t.name,
        'category', t.category,
        'license', t.license,
        'version', t.version,
        'description', t.description,
        'color', t.color,
        'language', t.language,
        'ecosystem', t.ecosystem,
        'dataModel', t.data_model,
        'supportsVectorNative', t.supports_vector_native,
        'provider', t.provider,
        'contextWindow', t.context_window,
        'isMultimodal', t.is_multimodal,
        'costPer1kInputTokens', t.cost_per_1k_input_tokens,
        'costPer1kOutputTokens', t.cost_per_1k_output_tokens,
        'serviceType', t.service_type
      ))
    )
  `;

  private isTech(type: string): boolean {
    return ['Technology', 'Database', 'LLM', 'Framework', 'Cloud'].includes(type);
  }

  private mapTechCategory(type: string): string {
    switch (type) {
      case 'Database': return 'DATABASE';
      case 'LLM': return 'LLM';
      case 'Framework': return 'FRAMEWORK';
      case 'Cloud': return 'CLOUD';
      default: return 'TOOL';
    }
  }

  generate(intent: string, entities: ExtractedEntity[], relation: string | null): GeneratedSqlQuery {
    const params: any[] = [];

    // Case 1: No entities extracted - Fall back to general list queries based on Intent
    if (entities.length === 0) {
      this.logger.log(`No entities extracted. Generating general list query for intent: ${intent}`);
      switch (intent) {
        case 'FIND_DEVELOPER':
          return {
            query: `SELECT ${this.SELECT_DEVELOPER} AS source_node, NULL::json AS target_node, NULL::json AS link FROM developers d LIMIT 50`,
            params,
          };
        case 'FIND_PROJECT':
          return {
            query: `SELECT ${this.SELECT_PROJECT} AS source_node, NULL::json AS target_node, NULL::json AS link FROM projects p LIMIT 50`,
            params,
          };
        case 'FIND_COMPANY':
          return {
            query: `SELECT ${this.SELECT_COMPANY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM companies c LIMIT 50`,
            params,
          };
        case 'FIND_DATABASE':
          return {
            query: `SELECT ${this.SELECT_TECHNOLOGY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM technologies t WHERE t.category = 'DATABASE' LIMIT 50`,
            params,
          };
        case 'FIND_LLM':
          return {
            query: `SELECT ${this.SELECT_TECHNOLOGY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM technologies t WHERE t.category = 'LLM' LIMIT 50`,
            params,
          };
        case 'FIND_FRAMEWORK':
          return {
            query: `SELECT ${this.SELECT_TECHNOLOGY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM technologies t WHERE t.category = 'FRAMEWORK' LIMIT 50`,
            params,
          };
        case 'FIND_TECHNOLOGY':
          return {
            query: `SELECT ${this.SELECT_TECHNOLOGY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM technologies t WHERE t.category = 'TOOL' LIMIT 50`,
            params,
          };
        default:
          return {
            query: `SELECT ${this.SELECT_COMPANY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM companies c LIMIT 1`,
            params,
          };
      }
    }

    // Case 1.5: Multiple entities extracted - Adjacency Schema Solver
    if (entities.length >= 2) {
      const e1 = entities[0];
      const e2 = entities[1];
      params.push(e1.id, e2.id);

      this.logger.log(`Multiple entities matched: ${e1.entity} (${e1.type}) and ${e2.entity} (${e2.type}). Resolving via Adjacency Schema.`);

      // Developer & Tech
      if (e1.type === 'Developer' && this.isTech(e2.type)) {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link
            FROM developers d
            JOIN developer_technology dt ON d.id = dt.developer_id
            JOIN technologies t ON t.id = dt.technology_id
            WHERE d.id = $1 AND t.id = $2
          `.trim(),
          params,
        };
      }
      if (this.isTech(e1.type) && e2.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link
            FROM developers d
            JOIN developer_technology dt ON d.id = dt.developer_id
            JOIN technologies t ON t.id = dt.technology_id
            WHERE t.id = $1 AND d.id = $2
          `.trim(),
          params,
        };
      }

      // Developer & Project
      if (e1.type === 'Developer' && e2.type === 'Project') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp ON d.id = dp.developer_id
            JOIN projects p ON p.id = dp.project_id
            WHERE d.id = $1 AND p.id = $2
          `.trim(),
          params,
        };
      }
      if (e1.type === 'Project' && e2.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp ON d.id = dp.developer_id
            JOIN projects p ON p.id = dp.project_id
            WHERE p.id = $1 AND d.id = $2
          `.trim(),
          params,
        };
      }

      // Project & Tech
      if (e1.type === 'Project' && this.isTech(e2.type)) {
        return {
          query: `
            SELECT 
              ${this.SELECT_PROJECT} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link
            FROM projects p
            JOIN project_technology pt ON p.id = pt.project_id
            JOIN technologies t ON t.id = pt.technology_id
            WHERE p.id = $1 AND t.id = $2
          `.trim(),
          params,
        };
      }
      if (this.isTech(e1.type) && e2.type === 'Project') {
        return {
          query: `
            SELECT 
              ${this.SELECT_PROJECT} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link
            FROM projects p
            JOIN project_technology pt ON p.id = pt.project_id
            JOIN technologies t ON t.id = pt.technology_id
            WHERE t.id = $1 AND p.id = $2
          `.trim(),
          params,
        };
      }

      // Developer & Company
      if (e1.type === 'Developer' && e2.type === 'Company') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_COMPANY} AS target_node,
              json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link
            FROM developers d
            JOIN developer_company dc ON d.id = dc.developer_id
            JOIN companies c ON c.id = dc.company_id
            WHERE d.id = $1 AND c.id = $2
          `.trim(),
          params,
        };
      }
      if (e1.type === 'Company' && e2.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_COMPANY} AS target_node,
              json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link
            FROM developers d
            JOIN developer_company dc ON d.id = dc.developer_id
            JOIN companies c ON c.id = dc.company_id
            WHERE c.id = $1 AND d.id = $2
          `.trim(),
          params,
        };
      }

      // Developer & Developer (Colleagues sharing a project)
      if (e1.type === 'Developer' && e2.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp1.relationship_type || '_' || dp1.developer_id || '_' || dp1.project_id, 'source', dp1.developer_id, 'target', dp1.project_id, 'type', dp1.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp1.role, 'allocatedHours', dp1.allocated_hours, 'assignedAt', TO_CHAR(dp1.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp1 ON d.id = dp1.developer_id
            JOIN projects p ON p.id = dp1.project_id
            JOIN developer_project dp2 ON p.id = dp2.project_id
            WHERE d.id = $1 AND dp2.developer_id = $2
            UNION ALL
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp2.relationship_type || '_' || dp2.developer_id || '_' || dp2.project_id, 'source', dp2.developer_id, 'target', dp2.project_id, 'type', dp2.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp2.role, 'allocatedHours', dp2.allocated_hours, 'assignedAt', TO_CHAR(dp2.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp2 ON d.id = dp2.developer_id
            JOIN projects p ON p.id = dp2.project_id
            JOIN developer_project dp1 ON p.id = dp1.project_id
            WHERE d.id = $2 AND dp1.developer_id = $1
          `.trim(),
          params,
        };
      }
    }

    // Grab primary extracted entity (highest confidence match)
    const primaryEntity = entities[0];
    params.push(primaryEntity.id);

    // Case 2: Explicit details lookup intents
    if (intent === 'PROJECT_DETAILS' || intent === 'TECH_DETAILS' || intent === 'COMPANY_DETAILS') {
      return this.buildDetailsQuery(primaryEntity.type, primaryEntity.id);
    }

    // Case 3: Schema Adjacency Solver (Maps path queries based on Target Intent and Entity Node Type)
    if (intent === 'FIND_DEVELOPER') {
      // Developer & Tech
      if (this.isTech(primaryEntity.type)) {
        if (relation === 'WORKS_ON') {
          return {
            query: `
              SELECT 
                ${this.SELECT_DEVELOPER} AS source_node,
                ${this.SELECT_PROJECT} AS target_node,
                json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link
              FROM developers d
              JOIN developer_project dp ON d.id = dp.developer_id AND dp.relationship_type = 'WORKS_ON'
              JOIN projects p ON p.id = dp.project_id
              JOIN project_technology pt ON p.id = pt.project_id
              JOIN technologies t ON t.id = pt.technology_id
              WHERE t.id = $1
              UNION ALL
              SELECT 
                ${this.SELECT_PROJECT} AS source_node,
                ${this.SELECT_TECHNOLOGY} AS target_node,
                json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link
              FROM projects p
              JOIN project_technology pt ON p.id = pt.project_id
              JOIN technologies t ON t.id = pt.technology_id
              JOIN developer_project dp ON p.id = dp.project_id AND dp.relationship_type = 'WORKS_ON'
              WHERE t.id = $1
            `.trim(),
            params,
          };
        } else {
          return {
            query: `
              SELECT 
                ${this.SELECT_DEVELOPER} AS source_node,
                ${this.SELECT_TECHNOLOGY} AS target_node,
                json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link
              FROM developers d
              JOIN developer_technology dt ON d.id = dt.developer_id
              JOIN technologies t ON t.id = dt.technology_id
              WHERE t.id = $1
            `.trim(),
            params,
          };
        }
      }
      // Developer & Project
      if (primaryEntity.type === 'Project') {
        const relLabel = relation === 'LEADS' ? 'LEADS' : 'WORKS_ON';
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp ON d.id = dp.developer_id AND dp.relationship_type = $2
            JOIN projects p ON p.id = dp.project_id
            WHERE p.id = $1
          `.trim(),
          params: [primaryEntity.id, relLabel],
        };
      }
      // Developer & Company
      if (primaryEntity.type === 'Company') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_COMPANY} AS target_node,
              json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link
            FROM developers d
            JOIN developer_company dc ON d.id = dc.developer_id
            JOIN companies c ON c.id = dc.company_id
            WHERE c.id = $1
          `.trim(),
          params,
        };
      }
    }

    if (intent === 'FIND_PROJECT') {
      // Project & Developer
      if (primaryEntity.type === 'Developer') {
        const relLabel = relation === 'LEADS' ? 'LEADS' : 'WORKS_ON';
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_PROJECT} AS target_node,
              json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link
            FROM developers d
            JOIN developer_project dp ON d.id = dp.developer_id AND dp.relationship_type = $2
            JOIN projects p ON p.id = dp.project_id
            WHERE d.id = $1
          `.trim(),
          params: [primaryEntity.id, relLabel],
        };
      }
      // Project & Tech
      if (this.isTech(primaryEntity.type)) {
        return {
          query: `
            SELECT 
              ${this.SELECT_PROJECT} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link
            FROM projects p
            JOIN project_technology pt ON p.id = pt.project_id
            JOIN technologies t ON t.id = pt.technology_id
            WHERE t.id = $1
          `.trim(),
          params,
        };
      }
      // Project & Document
      if (primaryEntity.type === 'Document') {
        return {
          query: `
            SELECT 
              ${this.SELECT_PROJECT} AS source_node,
              ${this.SELECT_DOCUMENT} AS target_node,
              json_build_object('id', 'REFERENCES_DOC_' || pd.project_id || '_' || pd.document_id, 'source', pd.project_id, 'target', pd.document_id, 'type', 'REFERENCES_DOC', 'properties', json_strip_nulls(json_build_object('relevance', pd.relevance))) AS link
            FROM projects p
            JOIN project_document pd ON p.id = pd.project_id
            JOIN documents doc ON doc.id = pd.document_id
            WHERE doc.id = $1
          `.trim(),
          params,
        };
      }
    }

    if (intent === 'FIND_COMPANY') {
      // Company & Developer
      if (primaryEntity.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_COMPANY} AS target_node,
              json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link
            FROM developers d
            JOIN developer_company dc ON d.id = dc.developer_id
            JOIN companies c ON c.id = dc.company_id
            WHERE d.id = $1
          `.trim(),
          params,
        };
      }
    }

    if (
      intent === 'FIND_TECHNOLOGY' ||
      intent === 'FIND_DATABASE' ||
      intent === 'FIND_FRAMEWORK' ||
      intent === 'FIND_LLM'
    ) {
      const targetCategory = intent === 'FIND_TECHNOLOGY' ? 'TOOL' : this.mapTechCategory(intent.replace('FIND_', ''));
      // Tech & Developer
      if (primaryEntity.type === 'Developer') {
        return {
          query: `
            SELECT 
              ${this.SELECT_DEVELOPER} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link
            FROM developers d
            JOIN developer_technology dt ON d.id = dt.developer_id
            JOIN technologies t ON t.id = dt.technology_id
            WHERE d.id = $1 AND (t.category = $2 OR $2 = 'TOOL')
          `.trim(),
          params: [primaryEntity.id, targetCategory],
        };
      }
      // Tech & Project
      if (primaryEntity.type === 'Project') {
        return {
          query: `
            SELECT 
              ${this.SELECT_PROJECT} AS source_node,
              ${this.SELECT_TECHNOLOGY} AS target_node,
              json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link
            FROM projects p
            JOIN project_technology pt ON p.id = pt.project_id
            JOIN technologies t ON t.id = pt.technology_id
            WHERE p.id = $1 AND (t.category = $2 OR $2 = 'TOOL')
          `.trim(),
          params: [primaryEntity.id, targetCategory],
        };
      }
    }

    // Case 4: Entity exists but relationship is null - return the neighborhood graph of the entity
    return this.buildDetailsQuery(primaryEntity.type, primaryEntity.id);
  }

  private buildDetailsQuery(type: string, id: string): GeneratedSqlQuery {
    const params = [id];
    
    switch (type) {
      case 'Developer':
        return {
          query: `
            SELECT ${this.SELECT_DEVELOPER} AS source_node, NULL::json AS target_node, NULL::json AS link FROM developers d WHERE d.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_COMPANY} AS target_node, json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link FROM developers d JOIN developer_company dc ON d.id = dc.developer_id JOIN companies c ON c.id = dc.company_id WHERE d.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_PROJECT} AS target_node, json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link FROM developers d JOIN developer_project dp ON d.id = dp.developer_id JOIN projects p ON p.id = dp.project_id WHERE d.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link FROM developers d JOIN developer_technology dt ON d.id = dt.developer_id JOIN technologies t ON t.id = dt.technology_id WHERE d.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_DOCUMENT} AS target_node, json_build_object('id', 'AUTHORED_' || dd.developer_id || '_' || dd.document_id, 'source', dd.developer_id, 'target', dd.document_id, 'type', 'AUTHORED', 'properties', json_strip_nulls(json_build_object('authoredAt', TO_CHAR(dd.authored_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) AS link FROM developers d JOIN developer_document dd ON d.id = dd.developer_id JOIN documents doc ON doc.id = dd.document_id WHERE d.id = $1
          `.trim(),
          params,
        };

      case 'Company':
        return {
          query: `
            SELECT ${this.SELECT_COMPANY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM companies c WHERE c.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_COMPANY} AS target_node, json_build_object('id', 'BELONGS_TO_' || dc.developer_id || '_' || dc.company_id, 'source', dc.developer_id, 'target', dc.company_id, 'type', 'BELONGS_TO', 'properties', json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))) AS link FROM companies c JOIN developer_company dc ON c.id = dc.company_id JOIN developers d ON d.id = dc.developer_id WHERE c.id = $1
            UNION ALL
            SELECT ${this.SELECT_COMPANY} AS source_node, ${this.SELECT_PROJECT} AS target_node, json_build_object('id', 'COMMISSIONED_' || cp.company_id || '_' || cp.project_id, 'source', cp.company_id, 'target', cp.project_id, 'type', 'COMMISSIONED', 'properties', json_strip_nulls(json_build_object('contractId', cp.contract_id, 'budget', cp.budget))) AS link FROM companies c JOIN company_project cp ON c.id = cp.company_id JOIN projects p ON p.id = cp.project_id WHERE c.id = $1
          `.trim(),
          params,
        };

      case 'Project':
        return {
          query: `
            SELECT ${this.SELECT_PROJECT} AS source_node, NULL::json AS target_node, NULL::json AS link FROM projects p WHERE p.id = $1
            UNION ALL
            SELECT ${this.SELECT_COMPANY} AS source_node, ${this.SELECT_PROJECT} AS target_node, json_build_object('id', 'COMMISSIONED_' || cp.company_id || '_' || cp.project_id, 'source', cp.company_id, 'target', cp.project_id, 'type', 'COMMISSIONED', 'properties', json_strip_nulls(json_build_object('contractId', cp.contract_id, 'budget', cp.budget))) AS link FROM projects p JOIN company_project cp ON p.id = cp.project_id JOIN companies c ON c.id = cp.company_id WHERE p.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_PROJECT} AS target_node, json_build_object('id', dp.relationship_type || '_' || dp.developer_id || '_' || dp.project_id, 'source', dp.developer_id, 'target', dp.project_id, 'type', dp.relationship_type, 'properties', json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))) AS link FROM projects p JOIN developer_project dp ON p.id = dp.project_id JOIN developers d ON d.id = dp.developer_id WHERE p.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link FROM projects p JOIN project_technology pt ON p.id = pt.project_id JOIN technologies t ON t.id = pt.technology_id WHERE p.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_DOCUMENT} AS target_node, json_build_object('id', 'REFERENCES_DOC_' || pd.project_id || '_' || pd.document_id, 'source', pd.project_id, 'target', pd.document_id, 'type', 'REFERENCES_DOC', 'properties', json_strip_nulls(json_build_object('relevance', pd.relevance))) AS link FROM projects p JOIN project_document pd ON p.id = pd.project_id JOIN documents doc ON doc.id = pd.document_id WHERE p.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'DEPLOYS_TO_' || pc.project_id || '_' || pc.cloud_id, 'source', pc.project_id, 'target', pc.cloud_id, 'type', 'DEPLOYS_TO', 'properties', json_strip_nulls(json_build_object('region', pc.region, 'tier', pc.tier))) AS link FROM projects p JOIN project_cloud pc ON p.id = pc.project_id JOIN technologies t ON t.id = pc.cloud_id WHERE p.id = $1
          `.trim(),
          params,
        };

      case 'Document':
        return {
          query: `
            SELECT ${this.SELECT_DOCUMENT} AS source_node, NULL::json AS target_node, NULL::json AS link FROM documents doc WHERE doc.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_DOCUMENT} AS target_node, json_build_object('id', 'AUTHORED_' || dd.developer_id || '_' || dd.document_id, 'source', dd.developer_id, 'target', dd.document_id, 'type', 'AUTHORED', 'properties', json_strip_nulls(json_build_object('authoredAt', TO_CHAR(dd.authored_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) AS link FROM documents doc JOIN developer_document dd ON doc.id = dd.document_id JOIN developers d ON d.id = dd.developer_id WHERE doc.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_DOCUMENT} AS target_node, json_build_object('id', 'REFERENCES_DOC_' || pd.project_id || '_' || pd.document_id, 'source', pd.project_id, 'target', pd.document_id, 'type', 'REFERENCES_DOC', 'properties', json_strip_nulls(json_build_object('relevance', pd.relevance))) AS link FROM documents doc JOIN project_document pd ON doc.id = pd.document_id JOIN projects p ON p.id = pd.project_id WHERE doc.id = $1
            UNION ALL
            SELECT ${this.SELECT_DOCUMENT} AS source_node, json_build_object('id', doc2.id, 'label', 'Document', 'name', doc2.title, 'properties', json_build_object('id', doc2.id, 'title', doc2.title, 'docType', doc2.doc_type, 'content', doc2.content, 'summary', doc2.summary, 'createdAt', TO_CHAR(doc2.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', TO_CHAR(doc2.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'color', doc2.color)) AS target_node, json_build_object('id', 'EXTENDS_DOC_' || dd.source_id || '_' || dd.target_id, 'source', dd.source_id, 'target', dd.target_id, 'type', 'EXTENDS_DOC', 'properties', json_build_object('relationshipType', dd.relationship_type)) AS link FROM documents doc JOIN document_document dd ON doc.id = dd.source_id JOIN documents doc2 ON doc2.id = dd.target_id WHERE doc.id = $1
            UNION ALL
            SELECT json_build_object('id', doc2.id, 'label', 'Document', 'name', doc2.title, 'properties', json_build_object('id', doc2.id, 'title', doc2.title, 'docType', doc2.doc_type, 'content', doc2.content, 'summary', doc2.summary, 'createdAt', TO_CHAR(doc2.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', TO_CHAR(doc2.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'color', doc2.color)) AS source_node, ${this.SELECT_DOCUMENT} AS target_node, json_build_object('id', 'EXTENDS_DOC_' || dd.source_id || '_' || dd.target_id, 'source', dd.source_id, 'target', dd.target_id, 'type', 'EXTENDS_DOC', 'properties', json_build_object('relationshipType', dd.relationship_type)) AS link FROM documents doc JOIN document_document dd ON doc.id = dd.target_id JOIN documents doc2 ON doc2.id = dd.source_id WHERE doc.id = $1
          `.trim(),
          params,
        };

      default: // Technology / Database / LLM / Framework / Cloud
        return {
          query: `
            SELECT ${this.SELECT_TECHNOLOGY} AS source_node, NULL::json AS target_node, NULL::json AS link FROM technologies t WHERE t.id = $1
            UNION ALL
            SELECT ${this.SELECT_DEVELOPER} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'SKILLED_IN_' || dt.developer_id || '_' || dt.technology_id, 'source', dt.developer_id, 'target', dt.technology_id, 'type', 'SKILLED_IN', 'properties', json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)) AS link FROM technologies t JOIN developer_technology dt ON t.id = dt.technology_id JOIN developers d ON d.id = dt.developer_id WHERE t.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'USES_TECH_' || pt.project_id || '_' || pt.technology_id, 'source', pt.project_id, 'target', pt.technology_id, 'type', 'USES_TECH', 'properties', json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))) AS link FROM technologies t JOIN project_technology pt ON t.id = pt.technology_id JOIN projects p ON p.id = pt.project_id WHERE t.id = $1
            UNION ALL
            SELECT ${this.SELECT_PROJECT} AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'DEPLOYS_TO_' || pc.project_id || '_' || pc.cloud_id, 'source', pc.project_id, 'target', pc.cloud_id, 'type', 'DEPLOYS_TO', 'properties', json_strip_nulls(json_build_object('region', pc.region, 'tier', pc.tier))) AS link FROM technologies t JOIN project_cloud pc ON t.id = pc.cloud_id JOIN projects p ON p.id = pc.project_id WHERE t.id = $1
            UNION ALL
            SELECT ${this.SELECT_TECHNOLOGY} AS source_node, json_build_object('id', t2.id, 'label', CASE WHEN t2.category = 'FRAMEWORK' THEN 'Framework' WHEN t2.category = 'DATABASE' THEN 'Database' WHEN t2.category = 'LLM' THEN 'LLM' WHEN t2.category = 'CLOUD' THEN 'Cloud' ELSE 'Technology' END, 'name', t2.name, 'properties', json_strip_nulls(json_build_object('id', t2.id, 'name', t2.name, 'category', t2.category, 'license', t2.license, 'version', t2.version, 'color', t2.color))) AS target_node, json_build_object('id', 'INTEGRATES_WITH_' || ti.source_id || '_' || ti.target_id, 'source', ti.source_id, 'target', ti.target_id, 'type', 'INTEGRATES_WITH', 'properties', json_build_object('protocol', ti.protocol, 'pattern', ti.pattern)) AS link FROM technologies t JOIN technology_integration ti ON t.id = ti.source_id JOIN technologies t2 ON t2.id = ti.target_id WHERE t.id = $1
            UNION ALL
            SELECT json_build_object('id', t2.id, 'label', CASE WHEN t2.category = 'FRAMEWORK' THEN 'Framework' WHEN t2.category = 'DATABASE' THEN 'Database' WHEN t2.category = 'LLM' THEN 'LLM' WHEN t2.category = 'CLOUD' THEN 'Cloud' ELSE 'Technology' END, 'name', t2.name, 'properties', json_strip_nulls(json_build_object('id', t2.id, 'name', t2.name, 'category', t2.category, 'license', t2.license, 'version', t2.version, 'color', t2.color))) AS source_node, ${this.SELECT_TECHNOLOGY} AS target_node, json_build_object('id', 'INTEGRATES_WITH_' || ti.source_id || '_' || ti.target_id, 'source', ti.source_id, 'target', ti.target_id, 'type', 'INTEGRATES_WITH', 'properties', json_build_object('protocol', ti.protocol, 'pattern', ti.pattern)) AS link FROM technologies t JOIN technology_integration ti ON t.id = ti.target_id JOIN technologies t2 ON t2.id = ti.source_id WHERE t.id = $1
          `.trim(),
          params,
        };
    }
  }
}
