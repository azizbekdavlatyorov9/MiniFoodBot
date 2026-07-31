import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import TelegramBot from "node-telegram-bot-api";
import { User } from "./schema/bot.schema";
import { Model } from "mongoose";
import { Product } from "src/product/schema/product.schema";

@Injectable()
export class BotService {
  private bot: TelegramBot;

  private userState = new Map<number, string>();

  private showMainMenu(chatId: number) {
    this.bot.sendMessage(chatId, "🍔 Asosiy Menu", {
      reply_markup: {
        keyboard: [
          [{ text: "🥤 Ichimliklar" }, { text: "🍔 Yeguliklar" }],
          [{ text: "🍰 Shirinliklar" }],
        ],
        resize_keyboard: true,
      },
    });
  }

  constructor(
    @InjectModel(User.name) private UserModel: Model<User>,
    @InjectModel(Product.name)
    private ProductModel: Model<Product>,
  ) {
    this.bot = new TelegramBot(process.env.BOT_TOKEN as string, {
      polling: true,
    });

    this.bot.setMyCommands([
      { command: "/start", description: "Botdan ro'yxatdan o'tish" },
      { command: "/commands", description: "Tugmalar chiqadi" },
    ]);

    this.bot.onText(/\/start/, async (msg) => {
      const chatId: number = msg.from?.id as number;

      const foundedUser = await this.UserModel.findOne({ chatId });

      if (foundedUser) {
        return this.showMainMenu(chatId);
      }

      await this.UserModel.create({
        chatId,
        firstName: msg.from?.first_name,
      });

      this.userState.set(chatId, "phone");

      this.bot.sendMessage(chatId, "📞 Telefon raqamingizni yuboring", {
        reply_markup: {
          keyboard: [
            [
              {
                text: "📞 Telefon raqamni yuborish",
                request_contact: true,
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    });

    //  Contact
    this.bot.on("contact", async (msg) => {
      const chatId: number = msg.from?.id as number;

      if (this.userState.get(chatId) !== "phone") return;

      await this.UserModel.updateOne(
        { chatId },
        {
          phone: msg.contact?.phone_number,
        },
      );

      this.userState.set(chatId, "location");

      this.bot.sendMessage(chatId, "📍 Lokatsiyangizni yuboring", {
        reply_markup: {
          keyboard: [
            [
              {
                text: "📍 Location yuborish",
                request_location: true,
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    });

    //Location

    this.bot.on("location", async (msg) => {
      const chatId: number = msg.from?.id as number;

      if (this.userState.get(chatId) !== "location") return;

      await this.UserModel.updateOne(
        { chatId },
        {
          latitude: msg.location?.latitude,
          longitude: msg.location?.longitude,
        },
      );

      this.userState.delete(chatId);

      this.showMainMenu(chatId);
    });

    //ordered 
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;

      if (msg.text === "🥤 Ichimliklar") {
        return this.showDrinks(chatId);
      }

      if (msg.text === "🍔 Yeguliklar") {
        return this.showFoods(chatId);
      }

      if (msg.text === "🍰 Shirinliklar") {
        return this.showDesserts(chatId);
      }
    });

    this.bot.on("callback_query", async (query) => {
  const chatId = query.message!.chat.id;
  const data = query.data;

  if (data?.startsWith("order:")) {
    const productId = data.split(":")[1];

    const product = await this.ProductModel.findById(productId);

    if (!product) {
      return this.bot.answerCallbackQuery(query.id, {
        text: "Mahsulot topilmadi.",
      });
    }

    // Bu yerda Cart yoki Order bazasiga saqlashingiz mumkin

    await this.bot.answerCallbackQuery(query.id, {
      text: "✅ Mahsulot savatchaga qo'shildi.",
    });

    await this.bot.sendMessage(
      chatId,
      `🛒 ${product.name} savatchangizga qo'shildi.`
    );
  }
});

  }

  //showDrinks
  private async showDrinks(chatId: number): Promise<void> {
  const drinks = await this.ProductModel.find({
    category: "drink",
  });

  if (!drinks.length) {
   this.bot.sendMessage(chatId, "🥤 Ichimliklar mavjud emas.");
  }

  for (const item of drinks) {
    await this.bot.sendPhoto(chatId, item.image, {
      caption:
        `🥤 ${item.name}\n\n` +
        `💰 Narxi: ${item.price.toLocaleString()} so'm\n\n` +
        `📝 Tarkibi:\n${item.description}`,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🛒 Buyurtma berish",
              callback_data: `order:${item._id}`,
            },
          ],
        ],
      },
    });
  }
}

  // showFoods
  private async showFoods(chatId: number): Promise<void> {
  const foods = await this.ProductModel.find({
    category: "food",
  });

  for (const item of foods) {
    await this.bot.sendPhoto(chatId, item.image, {
      caption:
        `🍔 ${item.name}\n\n` +
        `💰 Narxi: ${item.price} so'm\n\n` +
        `📝 ${item.description}`,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🛒 Buyurtma berish",
              callback_data: `order:${item._id}`,
            },
          ],
        ],
      },
    });
  }
}

  // showDesserts
  private async showDesserts(chatId: number): Promise<void> {
    const desserts = await this.ProductModel.find({
      category: "dessert",
    });

    for (const item of desserts) {
      await this.bot.sendPhoto(chatId, item.image, {
        caption:
          `🍰 ${item.name}\n\n` +
          `💰 Narxi: ${item.price} so'm\n\n` +
          `📝 ${item.description}`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛒 Buyurtma berish",
                callback_data: `order:${item._id}`,
              },
            ],
          ],
        },
      });
    }
  }
}
