import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BotModule } from './bot/bot.module';
import { ProductModule } from './product/product.module';

@Module({
  imports: [
    ConfigModule.forRoot({envFilePath:".env", isGlobal:true}),
    MongooseModule.forRoot(process.env.MONGO_URI as string),
    BotModule,
    ProductModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
