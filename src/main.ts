import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { join } from "path";
import { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(
      AppModule,
    );

  app.useStaticAssets(
    join(process.cwd(), "uploads"),
    {
      prefix: "/uploads/",
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(3000);
}

bootstrap();