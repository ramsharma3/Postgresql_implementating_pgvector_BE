import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { IngestService } from './ingest.service';

@ApiTags('Ingestion')
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  private getFileContent(file?: any): string {
    if (!file || !file.buffer) {
      throw new BadRequestException('No CSV file uploaded.');
    }
    return file.buffer.toString('utf-8');
  }

  @Post('companies')
  @ApiOperation({ summary: 'Ingest companies CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCompanies(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestCompanies(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} companies.` };
  }

  @Post('developers')
  @ApiOperation({ summary: 'Ingest developers CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDevelopers(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestDevelopers(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} developers.` };
  }

  @Post('projects')
  @ApiOperation({ summary: 'Ingest projects CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadProjects(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestProjects(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} projects.` };
  }

  @Post('documents')
  @ApiOperation({ summary: 'Ingest documents CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocuments(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestDocuments(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} documents.` };
  }

  @Post('technologies')
  @ApiOperation({ summary: 'Ingest technologies CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadTechnologies(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestTechnologies(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} technologies.` };
  }

  @Post('relationships')
  @ApiOperation({ summary: 'Ingest relationships CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadRelationships(@UploadedFile() file?: any) {
    const csvContent = this.getFileContent(file);
    const count = await this.ingestService.ingestRelationships(csvContent);
    return { success: true, message: `Successfully ingested/updated ${count} relationships.` };
  }
}
