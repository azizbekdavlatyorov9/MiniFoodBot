import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";

import { OrderService } from "./order.service";
import { OrderController } from "./order.controller";

import { User } from "../bot/entities/bot.entity";
import { Product } from "../product/entities/product.entity";
import { CartItem } from "../cart/entities/cart.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      User,
      Product,
      CartItem,
    ]),
  ],

  controllers: [
    OrderController,
  ],

  providers: [
    OrderService,
  ],

  exports: [
    OrderService,
  ],
})
export class OrderModule {}