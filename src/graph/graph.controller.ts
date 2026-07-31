import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GraphService } from './graph.service';
import { GetGraphQueryDto, GetNeighborsQueryDto } from '../dto/graph-query.dto';

@ApiTags('Graph')
@Controller()
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get('graph')
  @ApiOperation({ summary: 'Retrieve full or filtered graph topology for D3 visual rendering' })
  @ApiResponse({ status: 200, description: 'Graph topology payload with nodes and links' })
  async getGraph(@Query() query: GetGraphQueryDto) {
    const data = await this.graphService.getGraph(query.limit, query.label);
    return {
      success: true,
      data,
    };
  }

  @Get('node/:id')
  @ApiOperation({ summary: 'Retrieve metadata and degree metrics for a single node' })
  @ApiParam({ name: 'id', description: 'Unique node identifier (e.g. proj-kg-explorer)' })
  @ApiResponse({ status: 200, description: 'Node properties and degree' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async getNodeById(@Param('id') id: string) {
    const data = await this.graphService.getNodeById(id);
    return {
      success: true,
      data,
    };
  }

  @Get('neighbors/:id')
  @ApiOperation({ summary: 'Retrieve 1-hop or 2-hop sub-graph neighborhood around a node' })
  @ApiParam({ name: 'id', description: 'Center node identifier' })
  @ApiResponse({ status: 200, description: 'Sub-graph payload around center node' })
  @ApiResponse({ status: 404, description: 'Center node not found' })
  async getNeighbors(
    @Param('id') id: string,
    @Query() query: GetNeighborsQueryDto,
  ) {
    const data = await this.graphService.getNeighbors(id, query.depth);
    return {
      success: true,
      data,
    };
  }
}
