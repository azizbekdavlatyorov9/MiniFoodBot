import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Payment } from "./entities/payment.entity";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";

import { Order } from "../order/entities/order.entity";
import { CartItem } from "src/cart/entities/cart.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Order,
      CartItem
    ]),
  ],

  controllers: [
    PaymentController,
  ],

  providers: [
    PaymentService,
  ],

  exports: [
    PaymentService,
  ],
})
export class PaymentModule {}