import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PgVectorService } from '../database/pg-vector.service';
import * as Fuse from 'fuse.js';
import * as nlpNamespace from 'compromise';
const nlp = (nlpNamespace as any).default || nlpNamespace;

export interface ExtractedEntity {
  entity: string;
  type: string;
  id: string;
  confidence: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'who', 'are', 'what', 'show', 'list', 'details', 'about', 
  'info', 'information', 'currently', 'only', 'which', 'where', 'whom', 'them', 
  'their', 'this', 'that', 'with', 'from', 'into', 'onto', 'over', 'under', 'here',
  'there', 'when', 'how', 'why', 'can', 'you', 'your', 'our', 'his', 'her', 'its',
  'which', 'working', 'work', 'works', 'have', 'has', 'had', 'do', 'does', 'did',
  'how', 'many', 'we', 'us', 'our', 'in', 'of', 'at', 'on', 'by', 'to', 'db', 'database'
]);

@Injectable()
export class EntityExtractorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EntityExtractorService.name);
  private entitiesCache: Array<{ id: string; name: string; type: string; searchNames: string[] }> = [];
  private fuse: Fuse<{ id: string; name: string; type: string; searchNames: string[] }> | null = null;

  constructor(private readonly pgVectorService: PgVectorService) {}

  async onApplicationBootstrap() {
    this.logger.log('Caching database entities for fuzzy extraction...');
    try {
      await this.loadEntities();
    } catch (err: any) {
      this.logger.error(`Failed to initialize entity extractor cache: ${err.message}`, err.stack);
    }
  }

  async loadEntities(): Promise<void> {
    const queryText = `
      SELECT id, 'Company' AS type, name, NULL AS description FROM companies
      UNION ALL
      SELECT id, 'Developer' AS type, name, NULL AS description FROM developers
      UNION ALL
      SELECT id, 'Project' AS type, name, description FROM projects
      UNION ALL
      SELECT id, 'Document' AS type, title AS name, summary AS description FROM documents
      UNION ALL
      SELECT id, 
             CASE 
               WHEN category = 'FRAMEWORK' THEN 'Framework'
               WHEN category = 'DATABASE' THEN 'Database'
               WHEN category = 'LLM' THEN 'LLM'
               WHEN category = 'CLOUD' THEN 'Cloud'
               ELSE 'Technology'
             END AS type,
             name, description 
      FROM technologies;
    `;

    const res = await this.pgVectorService.query(queryText);

    this.entitiesCache = res.rows.map((row: any) => {
      const type = row.type;
      const primaryName = row.name || '';
      const searchNames = new Set<string>([primaryName.toLowerCase()]);

      // Acronym and shortname extraction from descriptions
      const description = row.description || '';
      if (description) {
        // Extract acronym conventions like (AWS) from description text
        const acronymMatches = description.match(/\(([A-Z]{2,6})\)/g);
        if (acronymMatches) {
          acronymMatches.forEach((m: string) => {
            const cleanAcronym = m.replace(/[()]/g, '');
            searchNames.add(cleanAcronym.toLowerCase());
          });
        }
      }

      return {
        id: row.id,
        name: primaryName,
        type,
        searchNames: Array.from(searchNames),
      };
    });

    const FuseClass = (Fuse as any).default || Fuse;
    this.fuse = new FuseClass(this.entitiesCache, {
      keys: ['searchNames'],
      threshold: 0.35, // Balance strict match accuracy with spelling tolerance
      includeScore: true,
    });

    this.logger.log(`Successfully cached and indexed ${this.entitiesCache.length} entities with aliases for fuzzy NLP matching.`);
  }

  extract(query: string): ExtractedEntity[] {
    const res = this.extractWithDisambiguation(query);
    return res.entities;
  }

  extractWithDisambiguation(query: string): {
    entities: ExtractedEntity[];
    ambiguousTerm?: string;
    disambiguationOptions?: ExtractedEntity[];
  } {
    if (!this.fuse || this.entitiesCache.length === 0) {
      this.logger.warn('Entity extractor cache is empty or uninitialized. Returning empty.');
      return { entities: [] };
    }

    const doc = nlp(query);
    // Find potential nouns and tagged proper nouns (compromise dependency parser tags)
    const nounPhrases = doc.nouns().out('array') as string[];
    
    // Fall back to clean words if compromise didn't extract any noun chunks
    const cleanWords = query
      .replace(/[?.!,;]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const searchTerms = Array.from(new Set([...nounPhrases, ...cleanWords, query]));
    const entities: ExtractedEntity[] = [];
    const processedIds = new Set<string>();

    for (const term of searchTerms) {
      const cleanTerm = term.trim();
      const lowerTerm = cleanTerm.toLowerCase();
      if (cleanTerm.length < 3 || STOP_WORDS.has(lowerTerm)) continue;

      const fuseRes = this.fuse.search(cleanTerm);
      if (fuseRes.length > 0) {
        const minConfidence = cleanTerm.length <= 4 ? 0.85 : 0.5;
        const candidateMatches = fuseRes
          .map((r) => {
            const score = r.score ?? 1;
            const confidence = parseFloat((1 - score).toFixed(2));
            return {
              entity: r.item.name,
              type: r.item.type,
              id: r.item.id,
              confidence,
            };
          })
          .filter((c) => c.confidence > minConfidence);

        if (candidateMatches.length === 0) continue;

        // Disambiguation Guard: If multiple matches have close scores (diff < 0.15)
        if (
          candidateMatches.length > 1 &&
          Math.abs(candidateMatches[0].confidence - candidateMatches[1].confidence) < 0.15 &&
          candidateMatches[0].id !== candidateMatches[1].id
        ) {
          this.logger.log(`Disambiguation required for search term: "${cleanTerm}"`);
          return {
            entities: [],
            ambiguousTerm: cleanTerm,
            disambiguationOptions: candidateMatches.slice(0, 4), // return top choices
          };
        }

        const bestMatch = candidateMatches[0];
        if (!processedIds.has(bestMatch.id)) {
          processedIds.add(bestMatch.id);
          entities.push(bestMatch);
        }
      }
    }

    // Sort by confidence descending
    return {
      entities: entities.sort((a, b) => b.confidence - a.confidence),
    };
  }
}
