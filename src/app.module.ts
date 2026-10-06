import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BotModule } from "./bot/bot.module";
import { ProductModule } from "./product/product.module";

import { User } from "./bot/entities/bot.entity";
import { Product } from "./product/entities/product.entity";
import { CartModule } from "./cart/cart.module";
import { OrderModule } from "./order/order.module";
import { PaymentModule } from "./payment/payment.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: "postgres",

      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),

      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,

      database: process.env.DB_DATABASE,

      autoLoadEntities: true,

      synchronize: true,
    }),

    BotModule,
    CartModule,
    OrderModule,  
    ProductModule,
    PaymentModule
  ],
})
export class AppModule {}