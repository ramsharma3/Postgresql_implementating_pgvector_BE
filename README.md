# AI Knowledge Graph Explorer Backend

This repository contains the NestJS production backend for the **AI Knowledge Graph Explorer**, featuring a programmatic **NLP Query Pipeline**, custom read-only Cypher query validation guards, and semantic **Hybrid RAG** (Graph + Vector retrieval) search.

---

## ⚡ Features

1. **Programmatic NLP Engine**: Translates natural language questions to Cypher queries programmatically using rule-based and fuzzy-matching dictionary indices. **Gemini does NOT generate Cypher anymore**, eliminating syntax hallucinations and injection vulnerabilities.
2. **Optional LLM Summarization**: Uses Google Gemini 3.5 Flash Lite exclusively to format and summarize the returned database graph records into user-friendly responses. If the API key is missing, it falls back to a clean list-based summary.
3. **Hybrid RAG Engine**: Combines semantic vector similarity lookups on Neo4j indices with graph neighbor traversals.
4. **Background Auto-Seeder**: On application bootstrap, the seeder automatically identifies `Document` and `Project` nodes that are missing vector properties (or have mismatching sizes) and updates them to the required 1536-dimensional embedding vectors using `gemini-embedding-2`.
5. **Strict Security Layer**: Restricts ad-hoc queries to read-only statements, blocking forbidden database mutations (`CREATE`, `SET`, `DELETE`, `MERGE`, `DROP`, `LOAD CSV`, `CALL dbms`).

---

## 🧠 Programmatic NLP Query Pipeline

The backend implements a modular, deterministic NLP query translation engine under `src/nlp/`.

### Pipeline Execution Flow
```
User Question ➔ Intent Classification ➔ Entity Extraction ➔ Relation Detection ➔ Cypher Generation ➔ Execution
```

1. **Intent Classification (`intent-classifier.service.ts`)**:
   Categorizes the question into one of the supported graph intents (e.g. `FIND_PROJECT`, `FIND_DEVELOPER`, `PROJECT_DETAILS`, `TECH_DETAILS`). Uses keyword-based rules with a confidence score.
2. **Entity Extraction (`entity-extractor.service.ts`)**:
   Performs token chunking using `compromise` and matches substrings against cached database nodes using `Fuse.js` fuzzy indexing. Resolves fuzzy user names (like *"Docker"*) to exact database node keys (like `'tech-docker'`) with high confidence.
3. **Relationship Detection (`relation-detector.service.ts`)**:
   Scans verbal predicates to map keywords (e.g. *"works on"*, *"skilled in"*) to database relationship labels (e.g. `WORKS_ON`, `SKILLED_IN`).
4. **Cypher Generator (`cypher-generator.service.ts`)**:
   Binds resolved database IDs, labels, and relationships to safe, pre-defined Cypher templates. Every query is fully parameterized (e.g. `WHERE t.id = $entityId`) to completely prevent Cypher injection attacks.
5. **Query Router (`query-router.service.ts`)**:
   Orchestrates the lifecycle, executing the query against Neo4j, converting results to graph data, and throwing a user-friendly suggestion error if classification confidence is too low.

---

## ⚙️ Prerequisites & Setup

- **Node.js**: `v20.x` or newer (Recommended: `v22.x`)
- **Neo4j Instance**: An active Neo4j database containing the target data schema and vector indexes (`vec_document_embeddings` and `vec_project_embeddings` configured for 1536 dimensions).

### 1. Environment Configuration

Copy the example configuration file:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials:
```env
PORT=3000

# Neo4j Database Connection
NEO4J_SCHEME=neo4j
NEO4J_HOST=localhost
NEO4J_PORT=7688
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password123
NEO4J_DATABASE=neo4j

# Gemini LLM Integration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

---

## 🚀 Running the Server

### Installation
```bash
npm install
```

### Run in Development (Watch mode)
```bash
npm run start:dev
```

### Production Build & Run
```bash
npm run build
npm run start
```

---

## 📚 API Gateway Documentation

### 1. Natural Language / Hybrid Query Endpoint
- **Route**: `POST /query`
- **Body Payload**:
  ```json
  {
    "question": "Which projects use Neo4j?",
    "mode": "cypher" // Options: "cypher" or "hybrid" (auto-detected if blank)
  }
  ```
- **Returns**:
  ```json
  {
    "success": true,
    "answer": "Explanation of the results...",
    "cypher": "MATCH (p:Project)-[:USES_TECH]->(t:Technology) ...",
    "graph": {
      "nodes": [...],
      "links": [...]
    },
    "executionTime": 32,
    "nodeCount": 4,
    "relationshipCount": 3
  }
  ```

### 2. Fetch Initial Graph Visual Layout
- **Route**: `GET /graph`
- **Returns**: The visual node-link structure containing core Projects and Companies for first-load layout rendering.

### 3. Database Statistics
- **Route**: `GET /stats`
- **Returns**: Summary node counts and label tallies of the connected database graph.
