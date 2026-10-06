import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { randomUUID } from "crypto";

import { Payment } from "./entities/payment.entity";
import { Order } from "../order/entities/order.entity";
import { CartItem } from "src/cart/entities/cart.entity";

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,
  ) {}

  async createTelegramInvoice(orderId: number) {
    const order = await this.orderRepository.findOne({
      where: {
        id: orderId,
      },
    });

    if (!order) {
      throw new NotFoundException("Buyurtma topilmadi");
    }

    if (order.status !== "pending") {
      throw new BadRequestException("Bu buyurtma uchun to'lov qilib bo'lmaydi");
    }

    const oldPayment = await this.paymentRepository.findOne({
      where: {
        order: {
          id: order.id,
        },
      },
    });

    if (oldPayment?.status === "paid") {
      throw new BadRequestException("Bu buyurtma allaqachon to'langan");
    }

    if (oldPayment) {
      return oldPayment;
    }

    const payment = this.paymentRepository.create({
      order,
      provider: "click",
      currency: "UZS",
      amount: Number(order.totalPrice),
      status: "pending",
      merchantTransId: `ORDER_${order.id}`,
      invoicePayload: `ORDER_${order.id}_${randomUUID()}`,
      telegramPaymentChargeId: null,
      providerPaymentChargeId: null,
    });

    return await this.paymentRepository.save(payment);
  }

  async validatePreCheckout(
    invoicePayload: string,
    totalAmount: number,
    currency: string,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: {
        invoicePayload,
      },

      relations: {
        order: {
          user: true,
        },
      },
    });

    if (!payment) {
      return {
        ok: false,
        message: "To'lov topilmadi",
      };
    }

    if (payment.status === "paid") {
      return {
        ok: false,
        message: "Bu buyurtma allaqachon to'langan",
      };
    }

    if (currency !== "UZS") {
      return {
        ok: false,
        message: "Noto'g'ri valyuta",
      };
    }

    // UZS Telegram Payments'da 2 decimal exp bilan yuradi
    const expectedAmount = Math.round(Number(payment.amount) * 100);

    if (Number(totalAmount) !== expectedAmount) {
      return {
        ok: false,
        message: "To'lov summasi mos kelmaydi",
      };
    }

    return {
      ok: true,
      payment,
    };
  }

  async markSuccessfulPayment(
    invoicePayload: string,
    telegramPaymentChargeId: string,
    providerPaymentChargeId: string | undefined,
    totalAmount: number,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: {
        invoicePayload,
      },

      relations: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    if (payment.status === "paid") {
      return payment;
    }

    const expectedAmount = Math.round(Number(payment.amount) * 100);

    if (Number(totalAmount) !== expectedAmount) {
      throw new BadRequestException("To'lov summasi noto'g'ri");
    }

    payment.status = "paid";

    payment.telegramPaymentChargeId = telegramPaymentChargeId;

    payment.providerPaymentChargeId = providerPaymentChargeId || null;

    const savedPayment = await this.paymentRepository.save(payment);

    // Karta to'lovi muvaffaqiyatli bo'ldi,
    // endi cartni tozalaymiz.
    await this.cartRepository.delete({
      user: {
        id: payment.order.user.id,
      },
    });

    return savedPayment;
  }

  async findByOrderId(orderId: number) {
    const payment = await this.paymentRepository.findOne({
      where: {
        order: {
          id: orderId,
        },
      },
      relations: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    return payment;
  }
}
