import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS for frontend visualizers (echos back origin dynamically to support credentials)
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Knowledge Graph Explorer API')
    .setDescription('Production NestJS REST API for graph traversals, natural language querying (Gemini Flash), and force-directed UI graph rendering.')
    .setVersion('1.0.0')
    .addTag('Operations')
    .addTag('Graph')
    .addTag('Stats')
    .addTag('Cypher')
    .addTag('Query')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`🚀 Server running on: http://localhost:${port}`);
  logger.log(`📚 Swagger Docs at:  http://localhost:${port}/api/docs`);
  logger.log(`=======================================================`);
}

bootstrap();
