import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Order } from "../../order/entities/order.entity";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => Order, (order) => order.payment, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "order_id",
  })
  order!: Order;

  @Column({
    type: "varchar",
    length: 20,
    default: "click",
  })
  provider!: "click";

  @Column({
    type: "varchar",
    length: 3,
    default: "UZS",
  })
  currency!: string;

  @Column("decimal", {
    precision: 12,
    scale: 2,
  })
  amount!: number;

  @Column({
    type: "enum",
    enum: [
      "pending",
      "paid",
      "failed",
      "cancelled",
    ],
    default: "pending",
  })
  status!:
    | "pending"
    | "paid"
    | "failed"
    | "cancelled";

  @Column({
    type: "varchar",
    unique: true,
  })
  merchantTransId!: string;

  @Column({
    type: "varchar",
    unique: true,
    nullable: true,
  })
  invoicePayload!: string | null;

  @Column({
    type: "varchar",
    nullable: true,
  })
  telegramPaymentChargeId!: string | null;

  @Column({
    type: "varchar",
    nullable: true,
  })
  providerPaymentChargeId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}