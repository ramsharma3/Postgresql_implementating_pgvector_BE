import { Injectable } from '@nestjs/common';

export interface RelationResult {
  relationship: string | null;
  confidence: number;
}

@Injectable()
export class RelationDetectorService {
  detect(query: string): RelationResult {
    const q = query.toLowerCase().trim();

    // 1. BELONGS_TO
    if (
      q.includes('belong') ||
      q.includes('belongs') ||
      q.includes('work at') ||
      q.includes('works at') ||
      q.includes('employed by') ||
      q.includes('employee') ||
      q.includes('in company') ||
      q.includes('works for') ||
      q.includes('work for')
    ) {
      return { relationship: 'BELONGS_TO', confidence: 0.95 };
    }

    // 2. LEADS
    if (
      q.includes('lead') ||
      q.includes('leads') ||
      q.includes('manager') ||
      q.includes('managed') ||
      q.includes('managing') ||
      q.includes('head of') ||
      q.includes('director')
    ) {
      return { relationship: 'LEADS', confidence: 0.95 };
    }

    // 3. WORKS_ON
    if (
      q.includes('work on') ||
      q.includes('works on') ||
      q.includes('assigned to') ||
      q.includes('working on') ||
      q.includes('develops') ||
      q.includes('builder of') ||
      q.includes('developer of')
    ) {
      return { relationship: 'WORKS_ON', confidence: 0.9 };
    }

    // 4. SKILLED_IN
    if (
      q.includes('skilled') ||
      q.includes('skill') ||
      q.includes('skills') ||
      q.includes('knows') ||
      q.includes('expert in') ||
      q.includes('proficient') ||
      q.includes('expertise') ||
      q.includes('experience in')
    ) {
      return { relationship: 'SKILLED_IN', confidence: 0.95 };
    }

    // 5. DEPLOYS_TO
    if (
      q.includes('deploy') ||
      q.includes('deploys') ||
      q.includes('hosted') ||
      q.includes('hosts') ||
      q.includes('runs on') ||
      q.includes('running in') ||
      q.includes('infrastructure')
    ) {
      return { relationship: 'DEPLOYS_TO', confidence: 0.9 };
    }

    // 6. REFERENCES_DOC
    if (
      q.includes('reference') ||
      q.includes('references') ||
      q.includes('document') ||
      q.includes('documents') ||
      q.includes('docs') ||
      q.includes('documentation') ||
      q.includes('related to doc')
    ) {
      return { relationship: 'REFERENCES_DOC', confidence: 0.95 };
    }

    // 7. USES_TECH
    if (
      q.includes('use') ||
      q.includes('uses') ||
      q.includes('using') ||
      q.includes('built with') ||
      q.includes('built on') ||
      q.includes('written in') ||
      q.includes('integrated') ||
      q.includes('utilize') ||
      q.includes('utilizes')
    ) {
      return { relationship: 'USES_TECH', confidence: 0.85 };
    }

    // Default: No explicit relationship matched
    return { relationship: null, confidence: 0.0 };
  }
}
