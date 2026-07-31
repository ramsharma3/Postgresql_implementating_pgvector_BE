import { Injectable, NotFoundException } from '@nestjs/common';
import { GraphRepository } from '../repositories/graph.repository';
import { SubGraphPayload } from '../interfaces/graph.interface';

@Injectable()
export class GraphService {
  constructor(private readonly graphRepository: GraphRepository) {}

  async getGraph(limit: number = 300, label?: string): Promise<SubGraphPayload> {
    return this.graphRepository.fetchGraph(limit, label);
  }

  async getNodeById(id: string) {
    const node = await this.graphRepository.findNodeById(id);
    if (!node) {
      throw new NotFoundException(`Node with ID '${id}' not found`);
    }
    return node;
  }

  async getNeighbors(id: string, depth: number = 1): Promise<SubGraphPayload> {
    // Verify node exists
    await this.getNodeById(id);

    const graph = await this.graphRepository.fetchNeighbors(id, depth);
    graph.centerNodeId = id;
    graph.depth = depth;

    return graph;
  }
}
