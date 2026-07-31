import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptService {
  buildCypherPrompt(question: string, schemaGrounding?: string): string {
    const schema = schemaGrounding || `
Node Labels and Properties:
- :Company {id: String, name: String, type: String ('CLIENT'|'PARTNER'|'VENDOR'|'INTERNAL_UNIT'), domain: String, website: String}
- :Developer {id: String, name: String, email: String, role: String ('AI_ENGINEER'|'FULLSTACK_DEV'|'DATA_SCIENTIST'|'DEVOPS_LEAD'|'BACKEND_ENGINEER'), experienceLevel: String ('JUNIOR'|'MID'|'SENIOR'|'STAFF'|'PRINCIPAL'), availability: Float}
- :Project {id: String, name: String, description: String, status: String ('ACTIVE'|'MAINTENANCE'|'PROPOSED'), startDate: String}
- :Technology (Base Label for tools/frameworks/databases/LLMs/clouds)
- :Technology:Framework {id: String, name: String, category: 'FRAMEWORK', language: String, ecosystem: String}
- :Technology:Database {id: String, name: String, category: 'DATABASE', dataModel: String, supportsVectorNative: Boolean}
- :Technology:LLM {id: String, name: String, category: 'LLM', provider: String ('Google'|'OpenAI'|'Anthropic'|'Meta'|'Mistral AI'), contextWindow: Integer, isMultimodal: Boolean}
- :Technology:Cloud {id: String, name: String, category: 'CLOUD', provider: String ('AWS'|'GCP'|'Azure'), serviceType: String}
- :Document {id: String, title: String, docType: String ('ADR'|'SPEC'|'GUIDE'|'POSTMORTEM'|'PAPER'), summary: String}

Relationship Types:
- (Developer)-[:BELONGS_TO {since, department}]->(Company)
- (Company)-[:COMMISSIONED {contractId, budget}]->(Project)
- (Developer)-[:WORKS_ON {role, allocatedHours, assignedAt}]->(Project)
- (Developer)-[:LEADS {assignedAt}]->(Project)
- (Project)-[:USES_TECH {environment, purpose}]->(Technology)
- (Developer)-[:SKILLED_IN {proficiency: 1..5, yearsExp}]->(Technology)
- (Developer)-[:AUTHORED {authoredAt}]->(Document)
- (Project)-[:REFERENCES_DOC {relevance}]->(Document)
- (Document)-[:EXTENDS_DOC {relationshipType}]->(Document)
- (Project)-[:DEPLOYS_TO {region, tier}]->(Cloud)
- (Technology)-[:INTEGRATES_WITH {protocol, pattern}]->(Technology)
`;

    return `You are an expert Neo4j Cypher Database Architect.
Your task is to convert a user's natural language question into a valid, executable, READ-ONLY Cypher query for Neo4j 5.x.
You must output ONLY the raw Cypher query. Do not wrap the query in markdown block, code fences, triple backticks (\`\`\`), or HTML tags. Do not write any explanations or headers.

DATABASE SCHEMA:
${schema}

CRITICAL RULES:
1. Generate ONLY Cypher query. No explanations, no conversation.
2. The query MUST be strictly READ-ONLY (use MATCH, RETURN, WHERE, WITH, OPTIONAL MATCH, LIMIT, ORDER BY).
3. Do NOT use modifying commands: CREATE, MERGE, SET, DELETE, DETACH, REMOVE, DROP.
4. Limit results to a maximum of 100 records.
5. Do NOT use backticks (\`\`\`) around the query.
6. When matching on name or title properties (e.g. Technology name, Project name, Company name), use case-insensitive substring matches (e.g. to lower-case checks: toLower(t.name) CONTAINS 'docker' or case-insensitive regex: t.name =~ '(?i).*docker.*') rather than exact string equality to accommodate full descriptive database names like 'Docker Container Engine'.
7. Always return full Node and Relationship entities (e.g. RETURN d, r, p, t or RETURN path) rather than returning individual property fields (e.g. RETURN t.name, t.category). Returning the actual node and relationship objects is REQUIRED for the frontend graph visualizer to render nodes and links correctly, and ensures the AI explainer has access to all entity properties (like the developer's name).

USER QUESTION: "${question}"

Generated Cypher:`;
  }

  buildAnswerPrompt(question: string, graphResults: any): string {
    return `You are an AI Knowledge Graph assistant.

Using ONLY the supplied graph results, answer the user's question.

Do not hallucinate.

If insufficient information exists, say so.

USER QUESTION: "${question}"

GRAPH RESULTS:
${JSON.stringify(graphResults, null, 2)}

Answer:`;
  }
}
