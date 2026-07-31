import { Module } from '@nestjs/common';
import { IntentClassifierService } from './intent-classifier.service';
import { EntityExtractorService } from './entity-extractor.service';
import { RelationDetectorService } from './relation-detector.service';
import { SqlQueryGeneratorService } from './sql-query-generator.service';
import { QueryRouterService } from './query-router.service';
import { TelemetryService } from './telemetry.service';

@Module({
  providers: [
    IntentClassifierService,
    EntityExtractorService,
    RelationDetectorService,
    SqlQueryGeneratorService,
    QueryRouterService,
    TelemetryService,
  ],
  exports: [
    QueryRouterService,
    EntityExtractorService,
    IntentClassifierService,
    TelemetryService,
  ],
})
export class NlpModule {}
