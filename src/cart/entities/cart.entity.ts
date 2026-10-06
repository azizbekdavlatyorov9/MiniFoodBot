import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../../bot/entities/bot.entity";
import { Product } from "../../product/entities/product.entity";

@Entity("cart_items")
export class CartItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(
    () => User,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({
    name: "user_id",
  })
  user!: User;

  @ManyToOne(
    () => Product,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({
    name: "product_id",
  })
  product!: Product;

  @Column({
    type: "integer",
    default: 1,
  })
  quantity!: number;
}