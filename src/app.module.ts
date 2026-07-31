import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { GraphModule } from './graph/graph.module';
import { StatsModule } from './stats/stats.module';
import { LlmModule } from './llm/llm.module';
import { IngestModule } from './ingest/ingest.module';
import { NetworkInterceptor } from './database/network.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    HealthModule,
    GraphModule,
    StatsModule,
    LlmModule,
    IngestModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: NetworkInterceptor,
    },
  ],
})
export class AppModule { }
