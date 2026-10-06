import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "bigint",
    unique: true,
  })
  chatId!: number;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
  })
  firstName!: string | null;

  @Column({
    type: "varchar",
    length: 30,
    nullable: true,
  })
  phone!: string | null;

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
}