import { Injectable, Logger } from '@nestjs/common';

export interface IntentResult {
  intent: string;
  confidence: number;
}

interface IntentPrototype {
  intent: string;
  phrase: string;
  embedding?: number[];
}

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  private prototypes: IntentPrototype[] = [
    { intent: 'FIND_DEVELOPER', phrase: 'show programmers developers software engineers skilled talent' },
    { intent: 'FIND_PROJECT', phrase: 'list projects software repositories repositories build code' },
    { intent: 'FIND_COMPANY', phrase: 'lookup company clients employers partner organizations firms' },
    { intent: 'FIND_DATABASE', phrase: 'find database technology systems sql nosql data store' },
    { intent: 'FIND_LLM', phrase: 'find large language models AI systems GPT Gemini Claude models' },
    { intent: 'FIND_FRAMEWORK', phrase: 'find software frameworks libraries packages npm runtime' },
    { intent: 'FIND_TECHNOLOGY', phrase: 'list technologies developer tools languages services infra' },
    { intent: 'PROJECT_DETAILS', phrase: 'details description information documentation outline overview of project' },
    { intent: 'COMPANY_DETAILS', phrase: 'details profile information context locations size about company employer' },
    { intent: 'TECH_DETAILS', phrase: 'details specification manual version features architecture about technology' },
  ];

  async initializePrototypes(geminiService: any): Promise<void> {
    this.logger.log('Pre-computing semantic embeddings for intent classifier prototypes...');
    for (const proto of this.prototypes) {
      try {
        proto.embedding = await geminiService.generateEmbedding(proto.phrase);
      } catch (err: any) {
        this.logger.warn(`Failed to embed phrase "${proto.phrase}": ${err.message}`);
      }
    }
    this.logger.log('Pre-computation of intent classifier embeddings finished.');
  }

  classify(query: string, queryEmbedding?: number[]): IntentResult {
    // 1. If embedding is provided, perform Cosine Similarity search
    if (queryEmbedding && this.prototypes.some((p) => p.embedding)) {
      let bestMatch: IntentPrototype | null = null;
      let highestSim = -1;

      for (const proto of this.prototypes) {
        if (proto.embedding) {
          const sim = this.cosineSimilarity(queryEmbedding, proto.embedding);
          if (sim > highestSim) {
            highestSim = sim;
            bestMatch = proto;
          }
        }
      }

      if (bestMatch && highestSim > 0.65) {
        this.logger.log(`Semantic classification hit: ${bestMatch.intent} (similarity: ${highestSim.toFixed(3)})`);
        return {
          intent: bestMatch.intent,
          confidence: parseFloat(highestSim.toFixed(2)),
        };
      }
    }

    // 2. Offline / Missing API key fallback (rule-based matches)
    const q = this.expandSynonyms(query);

    // Details check (highest specificity)
    if (q.includes('detail') || q.includes('about') || q.includes('info') || q.includes('information')) {
      if (q.includes('project')) {
        return { intent: 'PROJECT_DETAILS', confidence: 0.95 };
      }
      if (q.includes('company') || q.includes('employer') || q.includes('client') || q.includes('partner')) {
        return { intent: 'COMPANY_DETAILS', confidence: 0.95 };
      }
      if (
        q.includes('technology') ||
        q.includes('tech') ||
        q.includes('database') ||
        q.includes('db') ||
        q.includes('llm') ||
        q.includes('model') ||
        q.includes('framework')
      ) {
        return { intent: 'TECH_DETAILS', confidence: 0.95 };
      }
      return { intent: 'PROJECT_DETAILS', confidence: 0.6 };
    }

    // Technology sub-categories
    if (q.includes('database') || q.includes('db') || q.includes('data store')) {
      return { intent: 'FIND_DATABASE', confidence: 0.9 };
    }
    if (
      q.includes('llm') ||
      q.includes('large language model') ||
      q.includes('ai model') ||
      q.includes('models')
    ) {
      return { intent: 'FIND_LLM', confidence: 0.9 };
    }
    if (q.includes('framework') || q.includes('library') || q.includes('ecosystem')) {
      return { intent: 'FIND_FRAMEWORK', confidence: 0.9 };
    }
    if (
      q.includes('technology') ||
      q.includes('technologies') ||
      q.includes('tech') ||
      q.includes('tool') ||
      q.includes('tools')
    ) {
      return { intent: 'FIND_TECHNOLOGY', confidence: 0.85 };
    }

    // Main Entities searches
    if (
      q.includes('developer') ||
      q.includes('developers') ||
      q.includes('engineer') ||
      q.includes('engineers') ||
      q.includes('who knows') ||
      q.includes('who is skilled') ||
      q.includes('talent') ||
      q.includes('expert') ||
      q.includes('experts')
    ) {
      return { intent: 'FIND_DEVELOPER', confidence: 0.95 };
    }
    if (q.includes('company') || q.includes('companies') || q.includes('organization') || q.includes('organizations')) {
      return { intent: 'FIND_COMPANY', confidence: 0.95 };
    }
    if (q.includes('project') || q.includes('projects')) {
      return { intent: 'FIND_PROJECT', confidence: 0.95 };
    }

    // Default Fallbacks
    if (q.startsWith('who')) {
      return { intent: 'FIND_DEVELOPER', confidence: 0.75 };
    }
    if (q.startsWith('where') || q.includes('work at')) {
      return { intent: 'FIND_COMPANY', confidence: 0.7 };
    }
    if (q.startsWith('which') || q.startsWith('what')) {
      return { intent: 'FIND_PROJECT', confidence: 0.6 };
    }

    return { intent: 'FIND_PROJECT', confidence: 0.3 };
  }

  private expandSynonyms(query: string): string {
    let q = query.toLowerCase().trim();
    const synonyms: Record<string, string> = {
      'programmer': 'developer',
      'programmers': 'developers',
      'coder': 'developer',
      'coders': 'developers',
      'software engineer': 'developer',
      'software engineers': 'developers',
      'firm': 'company',
      'firms': 'companies',
      'corp': 'company',
      'corporation': 'company',
      'corporations': 'companies',
      'app': 'project',
      'apps': 'projects',
      'system': 'project',
      'systems': 'projects',
      'application': 'project',
      'applications': 'projects',
      'hired by': 'belongs_to',
      'employed by': 'belongs_to',
      'works at': 'belongs_to',
      'work at': 'belongs_to',
      'knows': 'skilled_in',
      'proficient in': 'skilled_in',
      'expert in': 'skilled_in',
    };

    for (const [key, value] of Object.entries(synonyms)) {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      q = q.replace(regex, value);
    }
    return q;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
