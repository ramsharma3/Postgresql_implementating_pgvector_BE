import { Injectable, Logger } from '@nestjs/common';
import { PgVectorService } from '../database/pg-vector.service';
import { GraphNode, GraphLink, SubGraphPayload } from '../interfaces/graph.interface';

@Injectable()
export class GraphRepository {
  private readonly logger = new Logger(GraphRepository.name);

  constructor(private readonly pgVectorService: PgVectorService) {}

  // Common builders for formatting SQL entities to GraphNode JSON
  private getSelectDeveloper(): string {
    return `json_build_object('id', d.id, 'label', 'Developer', 'name', d.name, 'properties', json_build_object('id', d.id, 'name', d.name, 'email', d.email, 'role', d.role, 'experienceLevel', d.experience_level, 'availability', d.availability, 'color', d.color))`;
  }
  private getSelectCompany(): string {
    return `json_build_object('id', c.id, 'label', 'Company', 'name', c.name, 'properties', json_build_object('id', c.id, 'name', c.name, 'type', c.type, 'domain', c.domain, 'website', c.website, 'color', c.color))`;
  }
  private getSelectProject(): string {
    return `json_build_object('id', p.id, 'label', 'Project', 'name', p.name, 'properties', json_build_object('id', p.id, 'name', p.name, 'description', p.description, 'status', p.status, 'repositoryUrl', p.repository_url, 'startDate', TO_CHAR(p.start_date, 'YYYY-MM-DD'), 'color', p.color))`;
  }
  private getSelectDocument(): string {
    return `json_build_object('id', doc.id, 'label', 'Document', 'name', doc.title, 'properties', json_build_object('id', doc.id, 'title', doc.title, 'docType', doc.doc_type, 'content', doc.content, 'summary', doc.summary, 'createdAt', TO_CHAR(doc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', TO_CHAR(doc.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'color', doc.color))`;
  }
  private getSelectTechnology(): string {
    return `json_build_object('id', t.id, 'label', CASE WHEN t.category = 'FRAMEWORK' THEN 'Framework' WHEN t.category = 'DATABASE' THEN 'Database' WHEN t.category = 'LLM' THEN 'LLM' WHEN t.category = 'CLOUD' THEN 'Cloud' ELSE 'Technology' END, 'name', t.name, 'properties', json_strip_nulls(json_build_object('id', t.id, 'name', t.name, 'category', t.category, 'license', t.license, 'version', t.version, 'description', t.description, 'color', t.color, 'language', t.language, 'ecosystem', t.ecosystem, 'dataModel', t.data_model, 'supportsVectorNative', t.supports_vector_native, 'provider', t.provider, 'contextWindow', t.context_window, 'isMultimodal', t.is_multimodal, 'costPer1kInputTokens', t.cost_per_1k_input_tokens, 'costPer1kOutputTokens', t.cost_per_1k_output_tokens, 'serviceType', t.service_type)))`;
  }

  async fetchGraph(limit: number = 300, label?: string): Promise<SubGraphPayload> {
    this.logger.log(`Fetching graph from PostgreSQL (limit: ${limit}, filter label: ${label || 'none'})...`);

    // We build a single UNION query that returns all edges and their node endpoints.
    // If a label filter is specified, we restrict source nodes to that label.
    const unionParts: string[] = [];

    // Define all 10 connections
    const connections = [
      {
        srcTable: 'developers d', srcSelect: this.getSelectDeveloper(), srcId: 'd.id', srcLabel: 'Developer',
        tgtTable: 'companies c', tgtSelect: this.getSelectCompany(), tgtId: 'c.id', tgtLabel: 'Company',
        joinTable: 'developer_company dc', joinOn: 'd.id = dc.developer_id AND c.id = dc.company_id',
        relType: 'BELONGS_TO', relProps: `json_strip_nulls(json_build_object('since', TO_CHAR(dc.since, 'YYYY-MM-DD'), 'department', dc.department))`
      },
      {
        srcTable: 'companies c', srcSelect: this.getSelectCompany(), srcId: 'c.id', srcLabel: 'Company',
        tgtTable: 'projects p', tgtSelect: this.getSelectProject(), tgtId: 'p.id', tgtLabel: 'Project',
        joinTable: 'company_project cp', joinOn: 'c.id = cp.company_id AND p.id = cp.project_id',
        relType: 'COMMISSIONED', relProps: `json_strip_nulls(json_build_object('contractId', cp.contract_id, 'budget', cp.budget))`
      },
      {
        srcTable: 'developers d', srcSelect: this.getSelectDeveloper(), srcId: 'd.id', srcLabel: 'Developer',
        tgtTable: 'projects p', tgtSelect: this.getSelectProject(), tgtId: 'p.id', tgtLabel: 'Project',
        joinTable: 'developer_project dp', joinOn: 'd.id = dp.developer_id AND p.id = dp.project_id',
        relType: 'WORKS_ON_OR_LEADS', // dynamically handled via column
        relProps: `json_strip_nulls(json_build_object('role', dp.role, 'allocatedHours', dp.allocated_hours, 'assignedAt', TO_CHAR(dp.assigned_at, 'YYYY-MM-DD')))`
      },
      {
        srcTable: 'projects p', srcSelect: this.getSelectProject(), srcId: 'p.id', srcLabel: 'Project',
        tgtTable: 'technologies t', tgtSelect: this.getSelectTechnology(), tgtId: 't.id', tgtLabel: 'Technology',
        joinTable: 'project_technology pt', joinOn: 'p.id = pt.project_id AND t.id = pt.technology_id',
        relType: 'USES_TECH', relProps: `json_strip_nulls(json_build_object('environment', pt.environment, 'purpose', pt.purpose))`
      },
      {
        srcTable: 'developers d', srcSelect: this.getSelectDeveloper(), srcId: 'd.id', srcLabel: 'Developer',
        tgtTable: 'technologies t', tgtSelect: this.getSelectTechnology(), tgtId: 't.id', tgtLabel: 'Technology',
        joinTable: 'developer_technology dt', joinOn: 'd.id = dt.developer_id AND t.id = dt.technology_id',
        relType: 'SKILLED_IN', relProps: `json_build_object('proficiency', dt.proficiency, 'yearsExp', dt.years_exp)`
      },
      {
        srcTable: 'developers d', srcSelect: this.getSelectDeveloper(), srcId: 'd.id', srcLabel: 'Developer',
        tgtTable: 'documents doc', tgtSelect: this.getSelectDocument(), tgtId: 'doc.id', tgtLabel: 'Document',
        joinTable: 'developer_document dd', joinOn: 'd.id = dd.developer_id AND doc.id = dd.document_id',
        relType: 'AUTHORED', relProps: `json_strip_nulls(json_build_object('authoredAt', TO_CHAR(dd.authored_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))`
      },
      {
        srcTable: 'projects p', srcSelect: this.getSelectProject(), srcId: 'p.id', srcLabel: 'Project',
        tgtTable: 'documents doc', tgtSelect: this.getSelectDocument(), tgtId: 'doc.id', tgtLabel: 'Document',
        joinTable: 'project_document pd', joinOn: 'p.id = pd.project_id AND doc.id = pd.document_id',
        relType: 'REFERENCES_DOC', relProps: `json_strip_nulls(json_build_object('relevance', pd.relevance))`
      },
      {
        srcTable: 'documents doc1', srcSelect: `json_build_object('id', doc1.id, 'label', 'Document', 'name', doc1.title, 'properties', json_build_object('id', doc1.id, 'title', doc1.title, 'docType', doc1.doc_type, 'content', doc1.content, 'summary', doc1.summary, 'createdAt', TO_CHAR(doc1.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', TO_CHAR(doc1.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'color', doc1.color))`, srcId: 'doc1.id', srcLabel: 'Document',
        tgtTable: 'documents doc2', tgtSelect: `json_build_object('id', doc2.id, 'label', 'Document', 'name', doc2.title, 'properties', json_build_object('id', doc2.id, 'title', doc2.title, 'docType', doc2.doc_type, 'content', doc2.content, 'summary', doc2.summary, 'createdAt', TO_CHAR(doc2.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', TO_CHAR(doc2.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'color', doc2.color))`, tgtId: 'doc2.id', tgtLabel: 'Document',
        joinTable: 'document_document dd', joinOn: 'doc1.id = dd.source_id AND doc2.id = dd.target_id',
        relType: 'EXTENDS_DOC', relProps: `json_build_object('relationshipType', dd.relationship_type)`
      },
      {
        srcTable: 'projects p', srcSelect: this.getSelectProject(), srcId: 'p.id', srcLabel: 'Project',
        tgtTable: 'technologies t', tgtSelect: this.getSelectTechnology(), tgtId: 't.id', tgtLabel: 'Cloud', // Target has Cloud properties
        joinTable: 'project_cloud pc', joinOn: 'p.id = pc.project_id AND t.id = pc.cloud_id',
        relType: 'DEPLOYS_TO', relProps: `json_strip_nulls(json_build_object('region', pc.region, 'tier', pc.tier))`
      },
      {
        srcTable: 'technologies t1', srcSelect: `json_build_object('id', t1.id, 'label', CASE WHEN t1.category = 'FRAMEWORK' THEN 'Framework' WHEN t1.category = 'DATABASE' THEN 'Database' WHEN t1.category = 'LLM' THEN 'LLM' WHEN t1.category = 'CLOUD' THEN 'Cloud' ELSE 'Technology' END, 'name', t1.name, 'properties', json_strip_nulls(json_build_object('id', t1.id, 'name', t1.name, 'category', t1.category, 'license', t1.license, 'version', t1.version, 'color', t1.color)))`, srcId: 't1.id', srcLabel: 'Technology',
        tgtTable: 'technologies t2', tgtSelect: `json_build_object('id', t2.id, 'label', CASE WHEN t2.category = 'FRAMEWORK' THEN 'Framework' WHEN t2.category = 'DATABASE' THEN 'Database' WHEN t2.category = 'LLM' THEN 'LLM' WHEN t2.category = 'CLOUD' THEN 'Cloud' ELSE 'Technology' END, 'name', t2.name, 'properties', json_strip_nulls(json_build_object('id', t2.id, 'name', t2.name, 'category', t2.category, 'license', t2.license, 'version', t2.version, 'color', t2.color)))`, tgtId: 't2.id', tgtLabel: 'Technology',
        joinTable: 'technology_integration ti', joinOn: 't1.id = ti.source_id AND t2.id = ti.target_id',
        relType: 'INTEGRATES_WITH', relProps: `json_build_object('protocol', ti.protocol, 'pattern', ti.pattern)`
      }
    ];

    const matchLabel = label ? label.toLowerCase() : null;

    for (const c of connections) {
      // Determine if this connection matches the requested label filter
      let matchesLabel = false;
      if (!matchLabel) {
        matchesLabel = true;
      } else {
        if (c.srcLabel.toLowerCase() === matchLabel) {
          matchesLabel = true;
        } else if (matchLabel === 'technology' || matchLabel === 'framework' || matchLabel === 'database' || matchLabel === 'llm' || matchLabel === 'cloud') {
          if (c.srcLabel.toLowerCase() === 'technology') {
            matchesLabel = true;
          }
        }
      }

      if (matchesLabel) {
        const typeExpr = c.relType === 'WORKS_ON_OR_LEADS' ? 'dp.relationship_type' : `'${c.relType}'`;
        const linkIdExpr = c.relType === 'WORKS_ON_OR_LEADS' 
          ? `dp.relationship_type || '_' || ${c.srcId} || '_' || ${c.tgtId}`
          : `'${c.relType}_' || ${c.srcId} || '_' || ${c.tgtId}`;

        unionParts.push(`
          SELECT 
            ${c.srcSelect} AS source_node,
            ${c.tgtSelect} AS target_node,
            json_build_object(
              'id', ${linkIdExpr},
              'source', ${c.srcId},
              'target', ${c.tgtId},
              'type', ${typeExpr},
              'properties', ${c.relProps}
            ) AS link
          FROM ${c.srcTable}
          JOIN ${c.tgtTable} ON TRUE
          JOIN ${c.joinTable} ON ${c.joinOn}
        `);
      }
    }

    if (unionParts.length === 0) {
      // Empty result if label matches nothing
      return { nodes: [], links: [] };
    }

    const fullSqlQuery = `
      SELECT source_node, target_node, link 
      FROM (
        ${unionParts.join('\nUNION ALL\n')}
      ) combined
      LIMIT $1
    `;

    const res = await this.pgVectorService.query(fullSqlQuery, [limit]);

    const nodesMap = new Map<string, GraphNode>();
    const linksMap = new Map<string, GraphLink>();

    for (const row of res.rows) {
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

    return {
      nodes: Array.from(nodesMap.values()),
      links: Array.from(linksMap.values()),
    };
  }

  async findNodeById(id: string): Promise<any> {
    const queries = [
      { table: 'companies', label: 'Company', sql: `SELECT id, name, type, domain, website, color FROM companies WHERE id = $1` },
      { table: 'developers', label: 'Developer', sql: `SELECT id, name, email, role, experience_level as "experienceLevel", availability, color FROM developers WHERE id = $1` },
      { table: 'projects', label: 'Project', sql: `SELECT id, name, description, status, repository_url as "repositoryUrl", start_date as "startDate", color FROM projects WHERE id = $1` },
      { table: 'documents', label: 'Document', sql: `SELECT id, title, doc_type as "docType", content, summary, created_at as "createdAt", updated_at as "updatedAt", color FROM documents WHERE id = $1` },
      { table: 'technologies', label: 'Technology', sql: `SELECT id, name, category, license, version, description, color, language, ecosystem, data_model as "dataModel", supports_vector_native as "supportsVectorNative", provider, context_window as "contextWindow", is_multimodal as "isMultimodal", cost_per_1k_input_tokens as "costPer1kInputTokens", cost_per_1k_output_tokens as "costPer1kOutputTokens", service_type as "serviceType" FROM technologies WHERE id = $1` }
    ];

    let foundNode: any = null;
    let primaryLabel = 'Node';

    for (const q of queries) {
      const res = await this.pgVectorService.query(q.sql, [id]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        primaryLabel = q.label;
        if (q.label === 'Technology') {
          if (row.category === 'FRAMEWORK') primaryLabel = 'Framework';
          else if (row.category === 'DATABASE') primaryLabel = 'Database';
          else if (row.category === 'LLM') primaryLabel = 'LLM';
          else if (row.category === 'CLOUD') primaryLabel = 'Cloud';
        }
        
        foundNode = {
          id: row.id,
          label: primaryLabel,
          name: row.name || row.title || row.id,
          color: row.color,
          properties: row,
        };
        break;
      }
    }

    if (!foundNode) {
      return null;
    }

    // Calculate degree (sum of references across all 10 join tables)
    const degreeSql = `
      SELECT (
        (SELECT COUNT(*) FROM developer_company WHERE developer_id = $1 OR company_id = $1) +
        (SELECT COUNT(*) FROM company_project WHERE company_id = $1 OR project_id = $1) +
        (SELECT COUNT(*) FROM developer_project WHERE developer_id = $1 OR project_id = $1) +
        (SELECT COUNT(*) FROM project_technology WHERE project_id = $1 OR technology_id = $1) +
        (SELECT COUNT(*) FROM developer_technology WHERE developer_id = $1 OR technology_id = $1) +
        (SELECT COUNT(*) FROM developer_document WHERE developer_id = $1 OR document_id = $1) +
        (SELECT COUNT(*) FROM project_document WHERE project_id = $1 OR document_id = $1) +
        (SELECT COUNT(*) FROM document_document WHERE source_id = $1 OR target_id = $1) +
        (SELECT COUNT(*) FROM project_cloud WHERE project_id = $1 OR cloud_id = $1) +
        (SELECT COUNT(*) FROM technology_integration WHERE source_id = $1 OR target_id = $1)
      ) AS degree;
    `;
    const degreeRes = await this.pgVectorService.query(degreeSql, [id]);
    foundNode.degree = parseInt(degreeRes.rows[0].degree, 10);

    return foundNode;
  }

  async fetchNeighbors(id: string, depth: number = 1): Promise<SubGraphPayload> {
    this.logger.log(`Fetching neighborhood graph around node "${id}" up to depth ${depth}...`);

    const visitedIds = new Set<string>([id]);
    const links: GraphLink[] = [];

    // Step 1: Query first hop
    const hop1Rels = await this.queryRelationshipsForIds(Array.from(visitedIds));
    for (const rel of hop1Rels) {
      links.push(rel);
      visitedIds.add(rel.source);
      visitedIds.add(rel.target);
    }

    // Step 2: Query second hop if depth === 2
    if (depth === 2 && visitedIds.size > 1) {
      const hop2Rels = await this.queryRelationshipsForIds(Array.from(visitedIds));
      for (const rel of hop2Rels) {
        // Only add if not already tracked
        if (!links.some((l) => l.id === rel.id)) {
          links.push(rel);
          visitedIds.add(rel.source);
          visitedIds.add(rel.target);
        }
      }
    }

    // Step 3: Fetch details of all unique node IDs collected
    const uniqueIds = Array.from(visitedIds);
    const nodes = await this.fetchNodeDetailsForIds(uniqueIds);

    return {
      nodes,
      links,
    };
  }

  private async queryRelationshipsForIds(ids: string[]): Promise<GraphLink[]> {
    if (ids.length === 0) return [];

    // Construct SQL UNION for checking IDs in 10 tables
    // We use array-based parameter checks e.g. source_id = ANY($1)
    const querySql = `
      SELECT source_id, target_id, rel_type, properties FROM (
        SELECT developer_id AS source_id, company_id AS target_id, 'BELONGS_TO' AS rel_type, json_strip_nulls(json_build_object('since', TO_CHAR(since, 'YYYY-MM-DD'), 'department', department)) AS properties FROM developer_company
        UNION ALL
        SELECT company_id AS source_id, project_id AS target_id, 'COMMISSIONED' AS rel_type, json_strip_nulls(json_build_object('contractId', contract_id, 'budget', budget)) AS properties FROM company_project
        UNION ALL
        SELECT developer_id AS source_id, project_id AS target_id, relationship_type AS rel_type, json_strip_nulls(json_build_object('role', role, 'allocatedHours', allocated_hours, 'assignedAt', TO_CHAR(assigned_at, 'YYYY-MM-DD'))) AS properties FROM developer_project
        UNION ALL
        SELECT project_id AS source_id, technology_id AS target_id, 'USES_TECH' AS rel_type, json_strip_nulls(json_build_object('environment', environment, 'purpose', purpose)) AS properties FROM project_technology
        UNION ALL
        SELECT developer_id AS source_id, technology_id AS target_id, 'SKILLED_IN' AS rel_type, json_build_object('proficiency', proficiency, 'yearsExp', years_exp) AS properties FROM developer_technology
        UNION ALL
        SELECT developer_id AS source_id, document_id AS target_id, 'AUTHORED' AS rel_type, json_strip_nulls(json_build_object('authoredAt', TO_CHAR(authored_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) AS properties FROM developer_document
        UNION ALL
        SELECT project_id AS source_id, document_id AS target_id, 'REFERENCES_DOC' AS rel_type, json_strip_nulls(json_build_object('relevance', relevance)) AS properties FROM project_document
        UNION ALL
        SELECT source_id, target_id, 'EXTENDS_DOC' AS rel_type, json_build_object('relationshipType', relationship_type) AS properties FROM document_document
        UNION ALL
        SELECT project_id AS source_id, cloud_id AS target_id, 'DEPLOYS_TO' AS rel_type, json_strip_nulls(json_build_object('region', region, 'tier', tier)) AS properties FROM project_cloud
        UNION ALL
        SELECT source_id, target_id, 'INTEGRATES_WITH' AS rel_type, json_build_object('protocol', protocol, 'pattern', pattern) AS properties FROM technology_integration
      ) combined
      WHERE source_id = ANY($1) OR target_id = ANY($1)
    `;

    const res = await this.pgVectorService.query(querySql, [ids]);
    return res.rows.map((row) => ({
      id: `${row.rel_type}_${row.source_id}_${row.target_id}`,
      source: row.source_id,
      target: row.target_id,
      type: row.rel_type,
      properties: row.properties,
    }));
  }

  private async fetchNodeDetailsForIds(ids: string[]): Promise<GraphNode[]> {
    if (ids.length === 0) return [];

    const nodes: GraphNode[] = [];

    // Run parallel checks for all node categories
    const companiesRes = await this.pgVectorService.query(`SELECT id, name, type, domain, website, color FROM companies WHERE id = ANY($1)`, [ids]);
    for (const row of companiesRes.rows) {
      nodes.push({
        id: row.id,
        label: 'Company',
        name: row.name,
        color: row.color,
        properties: row,
      });
    }

    const devsRes = await this.pgVectorService.query(`SELECT id, name, email, role, experience_level as "experienceLevel", availability, color FROM developers WHERE id = ANY($1)`, [ids]);
    for (const row of devsRes.rows) {
      nodes.push({
        id: row.id,
        label: 'Developer',
        name: row.name,
        color: row.color,
        properties: row,
      });
    }

    const projsRes = await this.pgVectorService.query(`SELECT id, name, description, status, repository_url as "repositoryUrl", start_date as "startDate", color FROM projects WHERE id = ANY($1)`, [ids]);
    for (const row of projsRes.rows) {
      nodes.push({
        id: row.id,
        label: 'Project',
        name: row.name,
        color: row.color,
        properties: {
          ...row,
          startDate: row.startDate ? (row.startDate as Date).toISOString().split('T')[0] : null,
        },
      });
    }

    const docsRes = await this.pgVectorService.query(`SELECT id, title, doc_type as "docType", content, summary, created_at as "createdAt", updated_at as "updatedAt", color FROM documents WHERE id = ANY($1)`, [ids]);
    for (const row of docsRes.rows) {
      nodes.push({
        id: row.id,
        label: 'Document',
        name: row.title,
        color: row.color,
        properties: row,
      });
    }

    const techsRes = await this.pgVectorService.query(`SELECT id, name, category, license, version, description, color, language, ecosystem, data_model as "dataModel", supports_vector_native as "supportsVectorNative", provider, context_window as "contextWindow", is_multimodal as "isMultimodal", cost_per_1k_input_tokens as "costPer1kInputTokens", cost_per_1k_output_tokens as "costPer1kOutputTokens", service_type as "serviceType" FROM technologies WHERE id = ANY($1)`, [ids]);
    for (const row of techsRes.rows) {
      let primaryLabel = 'Technology';
      if (row.category === 'FRAMEWORK') primaryLabel = 'Framework';
      else if (row.category === 'DATABASE') primaryLabel = 'Database';
      else if (row.category === 'LLM') primaryLabel = 'LLM';
      else if (row.category === 'CLOUD') primaryLabel = 'Cloud';

      // Strip null values to make it look exactly like Neo4j properties
      const props: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v !== null) props[k] = v;
      }

      nodes.push({
        id: row.id,
        label: primaryLabel,
        name: row.name,
        color: row.color,
        properties: props,
      });
    }

    return nodes;
  }
}
