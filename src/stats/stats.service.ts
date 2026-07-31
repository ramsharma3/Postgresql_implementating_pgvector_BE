import { Injectable } from '@nestjs/common';
import { StatsRepository } from '../repositories/stats.repository';
import { GraphStatsPayload } from '../interfaces/graph.interface';

@Injectable()
export class StatsService {
  constructor(private readonly statsRepository: StatsRepository) {}

  async getStats(): Promise<GraphStatsPayload> {
    const [totalNodes, totalRelationships, nodesByLabel, relationshipsByType] = await Promise.all([
      this.statsRepository.fetchTotalNodes(),
      this.statsRepository.fetchTotalRelationships(),
      this.statsRepository.fetchNodesByLabel(),
      this.statsRepository.fetchRelationshipsByType(),
    ]);

    return {
      totalNodes,
      totalRelationships,
      nodesByLabel,
      relationshipsByType,
    };
  }
}
