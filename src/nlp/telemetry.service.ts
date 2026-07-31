import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface TelemetryRecord {
  timestamp: string;
  question: string;
  mode: 'nlp' | 'llm_fallback' | 'hybrid';
  cypher: string;
  executionTimeMs: number;
  success: boolean;
  nodesCount: number;
  relationshipsCount: number;
  errorMessage?: string;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly logFilePath = path.join(process.cwd(), 'telemetry.jsonl');

  logQuery(record: Omit<TelemetryRecord, 'timestamp'>): void {
    const fullRecord: TelemetryRecord = {
      timestamp: new Date().toISOString(),
      ...record,
    };

    // Log to standard NestJS application logs
    this.logger.log(
      `[Telemetry] Question: "${fullRecord.question}" | Mode: ${fullRecord.mode} | ` +
      `Success: ${fullRecord.success} | Latency: ${fullRecord.executionTimeMs}ms | ` +
      `Nodes: ${fullRecord.nodesCount} | Links: ${fullRecord.relationshipsCount}`
    );

    if (fullRecord.errorMessage) {
      this.logger.warn(`[Telemetry Error] Message: ${fullRecord.errorMessage}`);
    }

    // Append to local telemetry.jsonl file for long-term audit trail
    try {
      const logLine = JSON.stringify(fullRecord) + '\n';
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch (err: any) {
      this.logger.error(`Failed to write query telemetry log line: ${err.message}`);
    }
  }
}
