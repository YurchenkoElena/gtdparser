import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('GTD Parser API')
    .setDescription('Middleware service for parsing GTD (Customs Declaration) PDF files from Bitrix24')
    .setVersion('1.0')
    .addTag('webhook', 'Webhook endpoints for Bitrix24')
    .addTag('jobs', 'Job status endpoints')
    .addTag('health', 'Health check endpoints')
    .addApiKey({ type: 'apiKey', name: 'auth_token', in: 'body' }, 'auth_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
