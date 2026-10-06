import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Order } from "./order.entity";
import { Product } from "../../product/entities/product.entity";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "order_id",
  })
  order!: Order;

  @ManyToOne(() => Product, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({
    name: "product_id",
  })
  product!: Product | null;

  @Column({
    type: "varchar",
    length: 255,
  })
  productName!: string;

  @Column("decimal", {
    precision: 10,
    scale: 2,
  })
  price!: number;

  @Column({
    type: "integer",
  })
  quantity!: number;
}