import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from "@nestjs/common";

import { PaymentService } from "./payment.service";

@Controller("payments")
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
  ) {}

  @Get("order/:orderId")
  async findByOrderId(
    @Param("orderId", ParseIntPipe)
    orderId: number,
  ) {
    return await this.paymentService.findByOrderId(
      orderId,
    );
  }
}