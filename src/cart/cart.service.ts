import { Injectable, NotFoundException } from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CartItem } from "./entities/cart.entity";
import { User } from "../bot/entities/bot.entity";
import { Product } from "../product/entities/product.entity";

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async addToCart(chatId: number, productId: number): Promise<CartItem> {
    const user = await this.userRepository.findOne({
      where: {
        chatId,
      },
    });

    if (!user) {
      throw new NotFoundException("Foydalanuvchi topilmadi");
    }

    const product = await this.productRepository.findOne({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException("Mahsulot topilmadi");
    }

    const existing = await this.cartRepository.findOne({
      where: {
        user: {
          id: user.id,
        },
        product: {
          id: product.id,
        },
      },
      relations: {
        user: true,
        product: true,
      },
    });

    if (existing) {
      existing.quantity += 1;

      const saved = await this.cartRepository.save(existing);

      console.log("CART UPDATED:", saved);

      return saved;
    }

    const cartItem = this.cartRepository.create({
      user,
      product,
      quantity: 1,
    });

    const saved = await this.cartRepository.save(cartItem);

    console.log("CART CREATED:", saved);

    return saved;
  }

  async getCart(chatId: number): Promise<CartItem[]> {
    const user = await this.userRepository.findOne({
      where: {
        chatId,
      },
    });

    if (!user) {
      throw new NotFoundException("Foydalanuvchi topilmadi");
    }

    const cartItems = await this.cartRepository.find({
      where: {
        user: {
          id: user.id,
        },
      },
      relations: {
        product: true,
      },
      order: {
        id: "ASC",
      },
    });

    console.log("USER ID:", user.id);
    console.log("CART ITEMS:", cartItems);

    return cartItems;
  }

  async increaseQuantity(chatId: number, cartItemId: number) {
    const cartItem = await this.cartRepository.findOne({
      where: {
        id: cartItemId,
      },
      relations: {
        user: true,
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException("Savatcha mahsuloti topilmadi");
    }

    // BIGINT PostgreSQL'dan string bo'lib kelishi mumkin
    if (String(cartItem.user.chatId) !== String(chatId)) {
      throw new NotFoundException(
        "Bu mahsulot sizning savatchingizga tegishli emas",
      );
    }

    cartItem.quantity = Number(cartItem.quantity) + 1;

    return await this.cartRepository.save(cartItem);
  }

  async decreaseQuantity(chatId: number, cartItemId: number) {
    const cartItem = await this.cartRepository.findOne({
      where: {
        id: cartItemId,
      },
      relations: {
        user: true,
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException("Savatcha mahsuloti topilmadi");
    }

    if (String(cartItem.user.chatId) !== String(chatId)) {
      throw new NotFoundException(
        "Bu mahsulot sizning savatchingizga tegishli emas",
      );
    }

    if (Number(cartItem.quantity) <= 1) {
      await this.cartRepository.remove(cartItem);

      return null;
    }

    cartItem.quantity = Number(cartItem.quantity) - 1;

    return await this.cartRepository.save(cartItem);
  }

  async removeItem(chatId: number, cartItemId: number) {
    const cartItem = await this.cartRepository.findOne({
      where: {
        id: cartItemId,
      },
      relations: {
        user: true,
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException("Savatcha mahsuloti topilmadi");
    }

    if (String(cartItem.user.chatId) !== String(chatId)) {
      throw new NotFoundException(
        "Bu mahsulot sizning savatchingizga tegishli emas",
      );
    }

    await this.cartRepository.remove(cartItem);

    return {
      message: "Mahsulot savatchadan o'chirildi",
    };
  }

  async clearCart(chatId: number) {
  const user = await this.userRepository.findOne({
    where: {
      chatId,
    },
  });

  if (!user) {
    throw new NotFoundException(
      "Foydalanuvchi topilmadi",
    );
  }

  await this.cartRepository.delete({
    user: {
      id: user.id,
    },
  });

  return {
    message: "Savatcha tozalandi",
  };
}
}
