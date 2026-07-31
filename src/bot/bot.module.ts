import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { User, UserSchema } from "./schema/bot.schema";
import { BotService } from "./bot.service";
import { Product, ProductSchema } from "src/product/schema/product.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name,
        schema: UserSchema },
      {
        name: Product.name,
        schema: ProductSchema,
      },
    ]),
  ],
  providers: [BotService],
})
export class BotModule {}
