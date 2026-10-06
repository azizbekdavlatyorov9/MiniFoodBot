import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CartItem } from "./entities/cart.entity";
import { CartService } from "./cart.service";

import { User } from "../bot/entities/bot.entity";
import { Product } from "../product/entities/product.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CartItem,
      User,
      Product,
    ]),
  ],

  providers: [
    CartService,
  ],

  exports: [
    CartService,
  ],
})
export class CartModule {}