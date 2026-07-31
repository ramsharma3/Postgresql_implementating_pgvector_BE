import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { GraphRepository } from '../repositories/graph.repository';

@Module({
  controllers: [GraphController],
  providers: [GraphService, GraphRepository],
  exports: [GraphService, GraphRepository],
})
export class GraphModule {}
