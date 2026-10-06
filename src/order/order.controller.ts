import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from "@nestjs/common";

import { OrderService } from "./order.service";

@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async findAll() {
    return await this.orderService.findAll();
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseIntPipe)
    id: number,
  ) {
    return await this.orderService.findOne(id);
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,

    @Body()
    body: {
      status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "delivering"
        | "delivered"
        | "rejected"
        | "cancelled"
    },
  ) {
    return await this.orderService.updateStatus(id, body.status);
  }
}
