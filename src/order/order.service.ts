import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { Order } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";

import { User } from "../bot/entities/bot.entity";
import { CartItem } from "../cart/entities/cart.entity";
import { Product } from "../product/entities/product.entity";

@Injectable()
export class OrderService {
  private checkoutComment = new Map<number, string>();
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,

    private readonly dataSource: DataSource,
  ) {}

  // =====================================================
  // CHECKOUT
  // =====================================================

  async checkout(
    chatId: number,
    paymentMethod: "cash" | "card",
    comment?: string,
  ) {
    const user = await this.userRepository.findOne({
      where: {
        chatId,
      },
    });

    if (!user) {
      throw new NotFoundException("Foydalanuvchi topilmadi");
    }

    // =========================================
    // OLDINGI PENDING ORDERNI TEKSHIRISH
    // =========================================

    const existingOrder = await this.orderRepository.findOne({
      where: {
        user: {
          id: user.id,
        },
        status: "pending",
      },
      relations: {
        payment: true,
        items: {
          product: true,
        },
      },
      order: {
        id: "DESC",
      },
    });

    if (existingOrder) {
      return {
        orderId: existingOrder.id,
        totalPrice: Number(existingOrder.totalPrice),
        paymentMethod: existingOrder.paymentMethod,
        status: existingOrder.status,
      };
    }

    // Savatchani olish
    const cartItems = await this.cartRepository.find({
      where: {
        user: {
          id: user.id,
        },
      },

      relations: {
        product: true,
      },
    });

    if (!cartItems.length) {
      throw new NotFoundException("Savatchangiz bo'sh");
    }

    // =========================================
    // JAMI SUMMANI HISOBLASH
    // =========================================

    let productTotal = 0;

    for (const item of cartItems) {
      const price = Number(item.product.price);

      productTotal += price * Number(item.quantity);
    }

    // Yetkazib berish narxi
    const deliveryFee = Number(process.env.DELIVERY_FEE || 0);

    // Mahsulotlar + yetkazib berish
    const totalPrice = productTotal + deliveryFee;

    // Transaction
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // =========================================
      // ORDER YARATISH
      // =========================================

      const order = queryRunner.manager.create(Order, {
        user,

        customerName: user.firstName,
        customerPhone: user.phone,

        latitude: user.latitude,
        longitude: user.longitude,

        comment: comment || null,

        totalPrice,
        deliveryFee,

        paymentMethod,

        status: "pending",
      });

      const savedOrder = await queryRunner.manager.save(Order, order);

      // =========================================
      // ORDER ITEMS
      // =========================================

      for (const item of cartItems) {
        const orderItem = queryRunner.manager.create(OrderItem, {
          order: savedOrder,

          product: item.product,

          // Mahsulot o'chirilsa ham
          // buyurtmada nomi qoladi
          productName: item.product.name,

          quantity: Number(item.quantity),

          // Buyurtma berilgan paytdagi
          // mahsulot narxi
          price: Number(item.product.price),
        });

        await queryRunner.manager.save(OrderItem, orderItem);
      }

      // =========================================
      // CARTNI TOZALASH
      // =========================================

      if (paymentMethod === "cash") {
        await queryRunner.manager.delete(CartItem, {
          user: {
            id: user.id,
          },
        });
      }

      await queryRunner.commitTransaction();

      return {
        orderId: savedOrder.id,

        totalPrice,

        paymentMethod,

        status: savedOrder.status,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // =====================================================
  // BARCHA BUYURTMALAR
  // =====================================================

  async findAll() {
    return await this.orderRepository.find({
      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },

      order: {
        id: "DESC",
      },
    });
  }

  // =====================================================
  // BITTA BUYURTMA
  // =====================================================

  async findOne(id: number) {
    const order = await this.orderRepository.findOne({
      where: {
        id,
      },

      relations: {
        user: true,
        payment: true,
        items: {
          product: true,
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Buyurtma topilmadi");
    }

    return order;
  }

  // =====================================================
  // STATUS O'ZGARTIRISH
  // =====================================================

  async updateStatus(
    id: number,
    status:
      | "pending"
      | "confirmed"
      | "preparing"
      | "delivering"
      | "delivered"
      | "rejected"
      | "cancelled",
  ) {
    const order = await this.orderRepository.findOne({
      where: {
        id,
      },

      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Buyurtma topilmadi");
    }

    order.status = status;

    return await this.orderRepository.save(order);
  }

  // =====================================================
  // USER BUYURTMALARI
  // =====================================================

  async getUserOrders(chatId: number) {
    const user = await this.userRepository.findOne({
      where: {
        chatId,
      },
    });

    if (!user) {
      throw new NotFoundException("Foydalanuvchi topilmadi");
    }

    return await this.orderRepository.find({
      where: {
        user: {
          id: user.id,
        },
      },

      relations: {
        payment: true,

        items: {
          product: true,
        },
      },

      order: {
        id: "DESC",
      },
    });
  }

  // =====================================================
  // PENDING BUYURTMALAR
  // =====================================================

  async getPendingOrders() {
    return await this.orderRepository.find({
      where: {
        status: "pending",
      },

      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },

      order: {
        id: "DESC",
      },
    });
  }

  // =====================================================
  // BUYURTMANI BEKOR QILISH
  // =====================================================

  async cancelOrder(chatId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: {
        id: orderId,
      },

      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Buyurtma topilmadi");
    }

    // BIGINT uchun string bilan tekshiramiz
    if (String(order.user.chatId) !== String(chatId)) {
      throw new NotFoundException("Bu buyurtma sizga tegishli emas");
    }

    // Faqat pending buyurtma bekor qilinadi
    if (order.status !== "pending") {
      throw new BadRequestException("Bu buyurtmani endi bekor qilib bo'lmaydi");
    }

    // To'langan buyurtmani bekor qilishga
    // ruxsat bermaymiz
    if (order.payment && order.payment.status === "paid") {
      throw new BadRequestException(
        "To'langan buyurtmani bekor qilib bo'lmaydi",
      );
    }

    order.status = "cancelled";

    if (order.payment) {
      order.payment.status = "cancelled";
    }

    return await this.orderRepository.save(order);
  }

  // =====================================================
  // BUYURTMALAR TARIXI
  // =====================================================

  async getOrderHistory() {
    return await this.orderRepository.find({
      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },

      order: {
        id: "DESC",
      },
    });
  }

  // =====================================================
  // STATUS BO'YICHA BUYURTMALAR
  // =====================================================

  async getOrdersByStatus(
    status:
      | "pending"
      | "confirmed"
      | "preparing"
      | "delivering"
      | "delivered"
      | "rejected"
      | "cancelled",
  ) {
    return await this.orderRepository.find({
      where: {
        status,
      },

      relations: {
        user: true,

        payment: true,

        items: {
          product: true,
        },
      },

      order: {
        id: "DESC",
      },
    });
  }
}
