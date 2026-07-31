import { Injectable } from '@nestjs/common';

@Injectable()
export class ParserService {
  cleanCypher(raw: string): string {
    if (!raw) return '';

    // Strip markdown code block fences and json wrap formats
    let clean = raw
      .replace(/```cypher/gi, '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Strip starting/ending quotes if the model wrapped the entire response in string quotes
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }

    return clean;
  }
}
