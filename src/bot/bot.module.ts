import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BotService } from "./bot.service";
import { BotController } from "./bot.controller";

import { User } from "./entities/bot.entity";
import { Product } from "../product/entities/product.entity";
import { CartModule } from "../cart/cart.module";
import { OrderModule } from "src/order/order.module";
import { PaymentModule } from "src/payment/payment.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Product,
    ]),

    CartModule,
    OrderModule,
    PaymentModule
  ],

  controllers: [
    BotController,
  ],

  providers: [
    BotService,
  ],

  exports: [
    BotService,
  ],
})
export class BotModule {}