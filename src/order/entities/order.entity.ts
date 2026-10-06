import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../../bot/entities/bot.entity";
import { OrderItem } from "./order-item.entity";
import { Payment } from "src/payment/entities/payment.entity";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, {
    onDelete: "RESTRICT",
    nullable: false,
  })
  @JoinColumn({
    name: "user_id",
  })
  user!: User;

  // Buyurtma berilgan paytdagi mijoz ma'lumotlari
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
  })
  customerName!: string | null;

  @Column({
    type: "varchar",
    length: 30,
    nullable: true,
  })
  customerPhone!: string | null;

  @Column({
    type: "text",
    nullable: true,
  })
  comment!: string | null;

  @Column({
    type: "double precision",
    nullable: true,
  })
  latitude!: number | null;

  @Column({
    type: "double precision",
    nullable: true,
  })
  longitude!: number | null;

  @Column("decimal", {
    precision: 10,
    scale: 2,
  })
  totalPrice!: number;

  @Column("decimal", {
    precision:10,
    scale:2,
    default:0
  })
  deliveryFee!:number

  @Column({
    type: "enum",
    enum: ["cash", "card"],
    default: "cash",
  })
  paymentMethod!: "cash" | "card";

  @Column({
    type: "enum",
    enum: [
      "pending",
      "confirmed",
      "preparing",
      "delivering",
      "delivered",
      "rejected",
      "cancelled",
    ],
    default: "pending",
  })
  status!:
    | "pending"
    | "confirmed"
    | "preparing"
    | "delivering"
    | "delivered"
    | "rejected"
    | "cancelled";

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
  items!: OrderItem[];

  @OneToOne(() => Payment, (payment) => payment.order)
  payment!: Payment;
}
