import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import TelegramBot from "node-telegram-bot-api";
import * as path from "path";
import * as fs from "fs";

import { User } from "./entities/bot.entity";
import { Product } from "../product/entities/product.entity";
import { CartService } from "../cart/cart.service";
import { OrderService } from "src/order/order.service";
import { PaymentService } from "src/payment/payment.service";

@Injectable()
export class BotService {
  private bot: TelegramBot;

  // Foydalanuvchi qaysi bosqichda ekanini vaqtincha saqlaymiz
  private userState = new Map<number, string>();
  private readonly adminChatId = Number(process.env.ADMIN_CHAT_ID);
  private checkoutComment = new Map<number, string>();
  private productData = new Map<
    number,
    {
      name?: string;
      price?: number;
      description?: string;
      category?: "drink" | "food" | "dessert";
    }
  >();

  private editProductData = new Map<
    number,
    {
      productId: number;
      name?: string;
      price?: number;
      description?: string;
      category?: "drink" | "food" | "dessert";
      image?: string;
    }
  >();

  private readonly statusMap: Record<
    string,
    | "pending"
    | "confirmed"
    | "preparing"
    | "delivering"
    | "delivered"
    | "rejected"
    | "cancelled"
  > = {
    "⏳ Kutilmoqda": "pending",
    "✅ Tasdiqlangan": "confirmed",
    "👨‍🍳 Tayyorlanmoqda": "preparing",
    "🚚 Yetkazilmoqda": "delivering",
    "✅ Yetkazilgan": "delivered",
    "❌ Rad etilgan": "rejected",
    "🚫 Bekor qilingan": "cancelled",
  };

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    private readonly cartService: CartService,
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
  ) {
    this.bot = new TelegramBot(process.env.BOT_TOKEN as string, {
      polling: true,
    });

    // Telegram commandlar
    this.bot.setMyCommands([
      {
        command: "start",
        description: "Botni boshlash",
      },
      {
        command: "commands",
        description: "Asosiy menyuni ochish",
      },
    ]);

    // =========================
    // /start
    // =========================

    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const foundedUser = await this.userRepository.findOne({
          where: {
            chatId,
          },
        });

        // Agar foydalanuvchi oldin ro'yxatdan o'tgan bo'lsa
        if (foundedUser) {
          return this.showMainMenu(chatId);
        }

        // Yangi userni PostgreSQL'ga saqlash
        const user = this.userRepository.create({
          chatId,
          firstName: msg.from?.first_name || null,
        });

        await this.userRepository.save(user);

        // Telefon bosqichiga o'tamiz
        this.userState.set(chatId, "phone");

        await this.bot.sendMessage(
          chatId,
          "👋 Assalomu alaykum!\n\n📞 Telefon raqamingizni yuboring:",
          {
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
          },
        );
      } catch (error) {
        console.error("START ERROR:", error);

        await this.bot.sendMessage(
          chatId,
          "❌ Xatolik yuz berdi. Iltimos, qaytadan /start bosing.",
        );
      }
    });

    // =========================
    // /commands
    // =========================

    this.bot.onText(/\/commands/, async (msg) => {
      const chatId = msg.chat.id;

      const user = await this.userRepository.findOne({
        where: {
          chatId,
        },
      });

      if (!user) {
        return this.bot.sendMessage(chatId, "Avval ro'yxatdan o'ting: /start");
      }

      this.showMainMenu(chatId);
    });

    this.bot.onText(/^\/admin$/, async (msg) => {
      const chatId = msg.chat.id;

      await this.showAdminMenu(chatId);
    });

    // =========================
    // CONTACT
    // =========================

    this.bot.on("contact", async (msg) => {
      const chatId = msg.chat.id;

      // Faqat telefon bosqichida bo'lsa ishlaydi
      if (this.userState.get(chatId) !== "phone") {
        return;
      }

      try {
        const phone = msg.contact?.phone_number;

        if (!phone) {
          return this.bot.sendMessage(chatId, "❌ Telefon raqam topilmadi.");
        }

        await this.userRepository.update(
          {
            chatId,
          },
          {
            phone,
          },
        );

        // Location bosqichiga o'tamiz
        this.userState.set(chatId, "location");

        await this.bot.sendMessage(
          chatId,
          "✅ Telefon raqamingiz saqlandi.\n\n📍 Endi lokatsiyangizni yuboring:",
          {
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
          },
        );
      } catch (error) {
        console.error("CONTACT ERROR:", error);

        await this.bot.sendMessage(
          chatId,
          "❌ Telefon raqamini saqlashda xatolik.",
        );
      }
    });

    // =========================
    // LOCATION
    // =========================

    this.bot.on("location", async (msg) => {
      const chatId = msg.chat.id;

      if (this.userState.get(chatId) !== "location") {
        return;
      }

      try {
        const latitude = msg.location?.latitude;
        const longitude = msg.location?.longitude;

        if (latitude === undefined || longitude === undefined) {
          return this.bot.sendMessage(
            chatId,
            "❌ Lokatsiya topilmadi. Qaytadan yuboring.",
          );
        }

        await this.userRepository.update(
          {
            chatId,
          },
          {
            latitude,
            longitude,
          },
        );

        // State'ni o'chiramiz
        this.userState.delete(chatId);

        await this.bot.sendMessage(chatId, "✅ Ro'yxatdan o'tish tugadi!");

        // Asosiy menyu
        return this.showMainMenu(chatId);
      } catch (error) {
        console.error("LOCATION ERROR:", error);

        await this.bot.sendMessage(chatId, "❌ Lokatsiyani saqlashda xatolik.");
      }
    });

    // =========================
    // MAIN MENU
    // =========================

    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (msg.successful_payment) {
        try {
          const payment = await this.paymentService.markSuccessfulPayment(
            msg.successful_payment.invoice_payload,

            msg.successful_payment.telegram_payment_charge_id,

            msg.successful_payment.provider_payment_charge_id,

            msg.successful_payment.total_amount,
          );

          const order = await this.orderService.findOne(payment.order.id);

          // Mijozga
          await this.bot.sendMessage(
            chatId,
            `✅ TO'LOV MUVAFFAQIYATLI!\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `💰 Summa: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
              `💳 To'lov: Click\n\n` +
              `⏳ Holati: Kutilmoqda`,
          );

          // Admin
          let adminMessage =
            `🔔 TO'LOV QILINDI!\n\n` +
            `🧾 Buyurtma №: ${order.id}\n` +
            `👤 Mijoz: ${order.customerName || "Noma'lum"}\n` +
            `📞 Telefon: ${order.customerPhone || "Noma'lum"}\n` +
            `💳 To'lov: Click\n` +
            `✅ To'lov holati: To'langan\n\n`;

          adminMessage += "🛒 MAHSULOTLAR:\n\n";

          for (const item of order.items) {
            const price = Number(item.price);
            const subtotal = price * item.quantity;

            adminMessage +=
              `🍔 ${item.productName}\n` +
              `🔢 ${item.quantity} dona\n` +
              `💰 ${price.toLocaleString()} so'm\n` +
              `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;
          }

          adminMessage +=
            `━━━━━━━━━━━━━━\n` +
            `💰 UMUMIY: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
            `⏳ Buyurtma: Kutilmoqda`;

          await this.bot.sendMessage(this.adminChatId, adminMessage, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Tasdiqlash",
                    callback_data: `confirm_order:${order.id}`,
                  },
                  {
                    text: "❌ Rad etish",
                    callback_data: `reject_order:${order.id}`,
                  },
                ],
              ],
            },
          });

          if (order.latitude !== null && order.longitude !== null) {
            await this.bot.sendLocation(
              this.adminChatId,
              order.latitude,
              order.longitude,
            );
          }

          return;
        } catch (error) {
          console.error("SUCCESSFUL PAYMENT ERROR:", error);

          await this.bot.sendMessage(
            chatId,
            "❌ To'lov amalga oshdi, lekin ma'lumotni saqlashda xatolik yuz berdi.",
          );

          return;
        }
      }

      if (this.userState.get(chatId) === "checkout_comment") {
        if (!msg.text) {
          return;
        }

        const comment =
          msg.text.trim().toLowerCase() === "yo'q" ? "" : msg.text.trim();

        this.checkoutComment.set(chatId, comment);

        this.userState.delete(chatId);

        await this.bot.sendMessage(chatId, "💳 To'lov turini tanlang:", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💵 Naqd pul",
                  callback_data: "checkout:cash",
                },
              ],
              [
                {
                  text: "💳 Karta",
                  callback_data: "checkout:card",
                },
              ],
            ],
          },
        });

        return;
      }

      if (msg.text === "🔎 Status bo'yicha buyurtmalar") {
        return this.showOrderStatusMenu(chatId);
      }

      const selectedStatus = msg.text ? this.statusMap[msg.text] : undefined;

      if (selectedStatus) {
        return this.showOrdersByStatus(chatId, selectedStatus);
      }

      if (!text) {
        return;
      }

      // Menyudagi tugmalar
      if (text === "🥤 Ichimliklar") {
        return this.showDrinks(chatId);
      }

      if (text === "🍔 Yeguliklar") {
        return this.showFoods(chatId);
      }

      if (text === "🍰 Shirinliklar") {
        return this.showDesserts(chatId);
      }

      if (msg.text === "🛒 Savatcham") {
        return this.showCart(chatId);
      }

      if (msg.text === "📦 Buyurtmalarim") {
        return this.showOrders(chatId);
      }
      if (msg.text === "📦 Buyurtmalar") {
        if (chatId !== this.adminChatId) {
          return this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");
        }

        return this.showAdminOrders(chatId);
      }

      // =========================
      // ADMIN PRODUCT ADD
      // =========================

      if (msg.text === "➕ Mahsulot qo'shish" && chatId === this.adminChatId) {
        this.userState.set(chatId, "product_name");

        this.productData.set(chatId, {});

        await this.bot.sendMessage(chatId, "📝 Mahsulot nomini yuboring:");

        return;
      }

      if (this.userState.get(chatId) === "product_name") {
        if (!msg.text) {
          return;
        }

        const data = this.productData.get(chatId);

        if (!data) {
          return;
        }

        data.name = msg.text;

        this.productData.set(chatId, data);

        this.userState.set(chatId, "product_price");

        await this.bot.sendMessage(chatId, "💰 Mahsulot narxini yuboring:");

        return;
      }

      if (this.userState.get(chatId) === "product_price") {
        if (!msg.text) {
          return;
        }

        const price = Number(msg.text.replace(/\s/g, ""));

        if (Number.isNaN(price) || price < 0) {
          await this.bot.sendMessage(
            chatId,
            "❌ Narx noto'g'ri.\nMasalan: 25000",
          );

          return;
        }

        const data = this.productData.get(chatId);

        if (!data) {
          return;
        }

        data.price = price;

        this.productData.set(chatId, data);

        this.userState.set(chatId, "product_description");

        await this.bot.sendMessage(chatId, "📝 Mahsulot tarkibini yuboring:");

        return;
      }

      if (this.userState.get(chatId) === "product_description") {
        if (!msg.text) {
          return;
        }

        const data = this.productData.get(chatId);

        if (!data) {
          return;
        }

        data.description = msg.text;

        this.productData.set(chatId, data);

        this.userState.set(chatId, "product_category");

        await this.bot.sendMessage(chatId, "📂 Kategoriyani tanlang:", {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "🥤 drink",
                },
                {
                  text: "🍔 food",
                },
              ],
              [
                {
                  text: "🍰 dessert",
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });

        return;
      }

      if (this.userState.get(chatId) === "product_category") {
        const categoryMap: Record<string, "drink" | "food" | "dessert"> = {
          "🥤 drink": "drink",
          "🍔 food": "food",
          "🍰 dessert": "dessert",
        };

        const category = msg.text ? categoryMap[msg.text] : undefined;

        if (!category) {
          await this.bot.sendMessage(
            chatId,
            "❌ Kategoriyani tugmalardan tanlang.",
          );

          return;
        }

        const data = this.productData.get(chatId);

        if (!data) {
          return;
        }

        data.category = category;

        this.productData.set(chatId, data);

        this.userState.set(chatId, "product_image");

        await this.bot.sendMessage(
          chatId,
          "🖼 Endi mahsulot rasmini yuboring:",
          {
            reply_markup: {
              remove_keyboard: true,
            },
          },
        );

        return;
      }

      if (msg.text === "🛠 Mahsulotlarni boshqarish") {
        if (chatId !== this.adminChatId) {
          return this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");
        }

        return this.showAdminProducts(chatId);
      }

      if (this.userState.get(chatId) === "edit_name") {
        if (!msg.text) {
          return;
        }

        const data = this.editProductData.get(chatId);

        if (!data) {
          return;
        }

        data.name = msg.text;

        this.editProductData.set(chatId, data);

        this.userState.set(chatId, "edit_price");

        await this.bot.sendMessage(chatId, "💰 Yangi narxni yuboring:");

        return;
      }

      if (this.userState.get(chatId) === "edit_price") {
        if (!msg.text) {
          return;
        }

        const price = Number(msg.text.replace(/\s/g, ""));

        if (Number.isNaN(price) || price < 0) {
          await this.bot.sendMessage(
            chatId,
            "❌ Narx noto'g'ri.\nMasalan: 25000",
          );

          return;
        }

        const data = this.editProductData.get(chatId);

        if (!data) {
          return;
        }

        data.price = price;

        this.editProductData.set(chatId, data);

        this.userState.set(chatId, "edit_description");

        await this.bot.sendMessage(chatId, "📝 Yangi tarkibni yuboring:");

        return;
      }

      if (this.userState.get(chatId) === "edit_description") {
        if (!msg.text) {
          return;
        }

        const data = this.editProductData.get(chatId);

        if (!data) {
          return;
        }

        data.description = msg.text;

        this.editProductData.set(chatId, data);

        this.userState.set(chatId, "edit_category");

        await this.bot.sendMessage(chatId, "📂 Yangi kategoriyani tanlang:", {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "🥤 drink",
                },
                {
                  text: "🍔 food",
                },
              ],
              [
                {
                  text: "🍰 dessert",
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });

        return;
      }

      if (this.userState.get(chatId) === "edit_category") {
        const categoryMap: Record<string, "drink" | "food" | "dessert"> = {
          "🥤 drink": "drink",
          "🍔 food": "food",
          "🍰 dessert": "dessert",
        };

        const category = msg.text ? categoryMap[msg.text] : undefined;

        if (!category) {
          await this.bot.sendMessage(
            chatId,
            "❌ Kategoriyani tugmalardan tanlang.",
          );

          return;
        }

        const data = this.editProductData.get(chatId);

        if (!data) {
          return;
        }

        data.category = category;

        const product = await this.productRepository.findOne({
          where: {
            id: data.productId,
          },
        });

        if (!product) {
          this.userState.delete(chatId);
          this.editProductData.delete(chatId);

          await this.bot.sendMessage(chatId, "❌ Mahsulot topilmadi.");

          return;
        }

        product.name = data.name!;
        product.price = data.price!;
        product.description = data.description!;
        product.category = data.category!;

        this.editProductData.set(chatId, {
          ...data,
          productId: product.id,
        });

        this.userState.set(chatId, "edit_image");

        await this.bot.sendMessage(
          chatId,
          "🖼 Yangi rasmni yuboring yoki `skip` deb yozing.",
        );

        await this.bot.sendMessage(
          chatId,
          `✅ Mahsulot yangilandi!\n\n` +
            `🆔 ID: ${product.id}\n` +
            `📝 Nomi: ${product.name}\n` +
            `💰 Narxi: ${Number(product.price).toLocaleString()} so'm\n` +
            `📂 Kategoriya: ${product.category}`,
          {
            reply_markup: {
              remove_keyboard: true,
            },
          },
        );

        await this.showAdminMenu(chatId);

        return;
      }

      if (msg.text === "📦 Buyurtmalar") {
        if (chatId !== this.adminChatId) {
          await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

          return;
        }

        return this.showAdminOrders(chatId);
      }

      if (this.userState.get(chatId) === "edit_image") {
        if (!msg.text) {
          return;
        }

        if (msg.text.toLowerCase() === "skip") {
          const data = this.editProductData.get(chatId);

          if (!data) {
            return;
          }

          const product = await this.productRepository.findOne({
            where: {
              id: data.productId,
            },
          });

          if (!product) {
            return;
          }

          product.name = data.name!;
          product.price = data.price!;
          product.description = data.description!;
          product.category = data.category!;

          await this.productRepository.save(product);

          this.userState.delete(chatId);
          this.editProductData.delete(chatId);

          await this.bot.sendMessage(
            chatId,
            `✅ Mahsulot yangilandi!\n\n` +
              `🆔 ID: ${product.id}\n` +
              `📝 Nomi: ${product.name}\n` +
              `💰 Narxi: ${Number(product.price).toLocaleString()} so'm\n` +
              `📂 Kategoriya: ${product.category}`,
          );

          await this.showAdminMenu(chatId);

          return;
        }
      }

      if (msg.text === "📊 Buyurtmalar tarixi") {
        if (chatId !== this.adminChatId) {
          return this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");
        }

        return this.showOrderHistory(chatId);
      }
    });

    this.bot.on("pre_checkout_query", async (query) => {
      try {
        console.log("PRE CHECKOUT:", query);

        const result = await this.paymentService.validatePreCheckout(
          query.invoice_payload,
          query.total_amount,
          query.currency,
        );

        if (!result.ok) {
          await this.bot.answerPreCheckoutQuery(query.id, false, {
            error_message: result.message,
          });

          return;
        }

        await this.bot.answerPreCheckoutQuery(query.id, true);

        console.log("✅ PRE CHECKOUT TASDIQLANDI");
      } catch (error) {
        console.error("PRE CHECKOUT ERROR:", error);

        await this.bot.answerPreCheckoutQuery(query.id, false, {
          error_message: "To'lovni tekshirishda xatolik yuz berdi",
        });
      }
    });

    this.bot.on("photo", async (msg) => {
      const chatId = msg.chat.id;

      if (chatId !== this.adminChatId) {
        return;
      }

      const state = this.userState.get(chatId);

      if (state !== "product_image" && state !== "edit_image") {
        return;
      }

      try {
        const photos = msg.photo;

        if (!photos?.length) {
          return;
        }

        const photo = photos[photos.length - 1];

        const uploadDir = path.join(process.cwd(), "uploads", "images");

        const filePath = await this.bot.downloadFile(photo.file_id, uploadDir);

        const fileName = path.basename(filePath);

        const imageUrl = `/uploads/images/${fileName}`;

        // YANGI MAHSULOT
        if (state === "product_image") {
          const data = this.productData.get(chatId);

          if (
            !data?.name ||
            data.price === undefined ||
            !data.description ||
            !data.category
          ) {
            return;
          }

          const product = this.productRepository.create({
            name: data.name,
            price: data.price,
            description: data.description,
            category: data.category,
            image: imageUrl,
          });

          await this.productRepository.save(product);

          this.userState.delete(chatId);
          this.productData.delete(chatId);

          await this.bot.sendMessage(chatId, "✅ Mahsulot qo'shildi!");

          await this.showAdminMenu(chatId);

          return;
        }

        // MAVJUD MAHSULOT RASMINI ALMASHTIRISH
        if (state === "edit_image") {
          const data = this.editProductData.get(chatId);

          if (!data) {
            return;
          }

          const product = await this.productRepository.findOne({
            where: {
              id: data.productId,
            },
          });

          if (!product) {
            return;
          }

          product.name = data.name!;
          product.price = data.price!;
          product.description = data.description!;
          product.category = data.category!;
          product.image = imageUrl;

          await this.productRepository.save(product);

          this.userState.delete(chatId);
          this.editProductData.delete(chatId);

          await this.bot.sendMessage(
            chatId,
            `✅ Mahsulot va rasmi yangilandi!\n\n` +
              `🆔 ID: ${product.id}\n` +
              `📝 ${product.name}\n` +
              `💰 ${Number(product.price).toLocaleString()} so'm`,
          );

          await this.showAdminMenu(chatId);

          return;
        }
      } catch (error) {
        console.error("EDIT/ADD IMAGE ERROR:", error);

        await this.bot.sendMessage(chatId, "❌ Rasmni saqlashda xatolik.");
      }
    });

    // =========================
    // BUYURTMA BERISH
    // =========================

    // =========================
    // CALLBACK QUERY
    // =========================

    this.bot.on("callback_query", async (query) => {
      try {
        const chatId = query.message?.chat.id;
        const data = query.data;

        if (!chatId || !data) {
          return;
        }

        // ==================================
        // SAVATCHAGA QO'SHISH
        // ==================================

        if (data.startsWith("order:")) {
          const productId = Number(data.split(":")[1]);

          const product = await this.productRepository.findOne({
            where: {
              id: productId,
            },
          });

          if (!product) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Mahsulot topilmadi",
            });

            return;
          }

          await this.cartService.addToCart(chatId, productId);

          await this.bot.answerCallbackQuery(query.id, {
            text: "✅ Savatchaga qo'shildi",
          });

          await this.bot.sendMessage(
            chatId,
            `🛒 ${product.name} savatchaga qo'shildi.`,
          );

          return;
        }

        // ==================================
        // CHECKOUT
        // ==================================

        if (data === "checkout:cash" || data === "checkout:card") {
          try {
            const paymentMethod = data === "checkout:cash" ? "cash" : "card";

            const comment = this.checkoutComment.get(chatId) || null;

            const result = await this.orderService.checkout(
              chatId,
              paymentMethod,
              comment || undefined,
            );

            // =========================
            // KARTA
            // =========================
            if (paymentMethod === "card") {
              const payment = await this.paymentService.createTelegramInvoice(
                result.orderId,
              );

              const providerToken = process.env.CLICK_PROVIDER_TOKEN;

              if (!providerToken) {
                throw new Error("CLICK_PROVIDER_TOKEN .env da topilmadi");
              }

              const amount = Math.round(Number(payment.amount) * 100);

              await this.bot.sendInvoice(
                chatId,
                `Buyurtma #${result.orderId}`,
                "Mini Fast Food buyurtmasi",
                payment.invoicePayload!,
                providerToken,
                "UZS",
                [
                  {
                    label: `Buyurtma #${result.orderId}`,
                    amount,
                  },
                ],
                {
                  need_name: false,
                  need_phone_number: false,
                  need_shipping_address: false,
                },
              );

              await this.bot.answerCallbackQuery(query.id, {
                text: "💳 To'lov oynasi yuborildi",
              });

              return;
            }

            // =========================
            // NAQD PUL
            // =========================

            this.checkoutComment.delete(chatId);

            const order = await this.orderService.findOne(result.orderId);

            let adminMessage =
              `🔔 YANGI BUYURTMA!\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `👤 Mijoz: ${order.customerName || "Noma'lum"}\n` +
              `📞 Telefon: ${order.customerPhone || "Noma'lum"}\n` +
              `💳 To'lov: 💵 Naqd pul\n\n`;

            adminMessage += "🛒 MAHSULOTLAR:\n\n";

            for (const item of order.items) {
              const price = Number(item.price);
              const subtotal = price * item.quantity;

              adminMessage +=
                `🍔 ${item.productName}\n` +
                `🔢 ${item.quantity} dona\n` +
                `💰 ${price.toLocaleString()} so'm\n` +
                `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;
            }

            adminMessage +=
              `━━━━━━━━━━━━━━\n` +
              `💰 UMUMIY: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
              `💳 To'lov: 💵 Naqd pul\n` +
              `⏳ Holati: Kutilmoqda`;

            await this.bot.sendMessage(this.adminChatId, adminMessage, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Tasdiqlash",
                      callback_data: `confirm_order:${order.id}`,
                    },
                    {
                      text: "❌ Rad etish",
                      callback_data: `reject_order:${order.id}`,
                    },
                  ],
                ],
              },
            });

            if (order.latitude !== null && order.longitude !== null) {
              await this.bot.sendLocation(
                this.adminChatId,
                order.latitude,
                order.longitude,
              );
            }

            await this.bot.answerCallbackQuery(query.id, {
              text: "✅ Buyurtma qabul qilindi",
            });

            await this.bot.sendMessage(
              chatId,
              `✅ BUYURTMANGIZ QABUL QILINDI!\n\n` +
                `🧾 Buyurtma №: ${order.id}\n` +
                `💰 Jami: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
                `💳 To'lov: 💵 Naqd pul\n\n` +
                `⏳ Holati: Kutilmoqda`,
            );

            return;
          } catch (error) {
            console.error("CHECKOUT ERROR:", error);

            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Buyurtma berishda xatolik",
            });

            return;
          }
        }

        // ==================================
        // TASDIQLASH
        // ==================================

        if (data.startsWith("confirm_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.findOne(orderId);

          // Karta orqali bo'lsa, avval payment tekshiriladi
          if (order.paymentMethod === "card") {
            if (!order.payment) {
              await this.bot.answerCallbackQuery(query.id, {
                text: "❌ To'lov topilmadi",
              });

              return;
            }

            if (order.payment.status !== "paid") {
              await this.bot.answerCallbackQuery(query.id, {
                text: "❌ Buyurtma hali to'lanmagan",
              });

              return;
            }
          }

          const updatedOrder = await this.orderService.updateStatus(
            orderId,
            "confirmed",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "✅ Buyurtma tasdiqlandi",
          });

          await this.bot.sendMessage(
            updatedOrder.user.chatId,
            `✅ BUYURTMANGIZ TASDIQLANDI!\n\n` +
              `🧾 Buyurtma №: ${updatedOrder.id}\n` +
              `💰 Jami: ${Number(
                updatedOrder.totalPrice,
              ).toLocaleString()} so'm\n` +
              `📦 Holati: ✅ Tasdiqlandi`,
          );

          if (query.message) {
            await this.bot.editMessageReplyMarkup(
              {
                inline_keyboard: [
                  [
                    {
                      text: "👨‍🍳 Tayyorlanmoqda",
                      callback_data: `preparing_order:${updatedOrder.id}`,
                    },
                  ],
                ],
              },
              {
                chat_id: this.adminChatId,
                message_id: query.message.message_id,
              },
            );
          }

          return;
        }

        // ==================================
        // RAD ETISH
        // ==================================

        if (data.startsWith("reject_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.updateStatus(
            orderId,
            "rejected",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "❌ Buyurtma rad etildi",
          });

          await this.bot.sendMessage(
            order.user.chatId,
            `❌ Buyurtmangiz RAD ETILDI.\n\n` + `🧾 Buyurtma №: ${order.id}`,
          );

          await this.bot.editMessageReplyMarkup(
            {
              inline_keyboard: [],
            },
            {
              chat_id: this.adminChatId,
              message_id: query.message!.message_id,
            },
          );

          return;
        }

        if (data.startsWith("cart_plus:")) {
          try {
            const cartItemId = Number(data.split(":")[1]);

            if (!cartItemId) {
              await this.bot.answerCallbackQuery(query.id, {
                text: "❌ Mahsulot ID noto'g'ri",
              });
              return;
            }

            console.log("PLUS:", {
              chatId,
              cartItemId,
            });

            await this.cartService.increaseQuantity(chatId, cartItemId);

            await this.bot.answerCallbackQuery(query.id, {
              text: "➕ Soni oshirildi",
            });

            await this.updateCartMessage(chatId, query.message?.message_id);

            return;
          } catch (error) {
            console.error("PLUS ERROR:", error);

            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Xatolik yuz berdi",
            });

            return;
          }
        }

        if (data.startsWith("cart_minus:")) {
          const cartItemId = Number(data.split(":")[1]);

          await this.cartService.decreaseQuantity(chatId, cartItemId);

          await this.bot.answerCallbackQuery(query.id, {
            text: "➖ Soni kamaytirildi",
          });

          return this.updateCartMessage(chatId, query.message?.message_id);
        }

        if (data.startsWith("cart_remove:")) {
          const cartItemId = Number(data.split(":")[1]);

          await this.cartService.removeItem(chatId, cartItemId);

          await this.bot.answerCallbackQuery(query.id, {
            text: "🗑 Mahsulot o'chirildi",
          });

          return this.updateCartMessage(chatId, query.message?.message_id);
        }

        if (data === "noop") {
          await this.bot.answerCallbackQuery(query.id, {
            text:"⏳ Amal bajarilmoqda...",
          });

          return;
        }

        if (data === "clear_cart") {
          try {
            await this.cartService.clearCart(chatId);

            await this.bot.answerCallbackQuery(query.id, {
              text: "🗑 Savatcha tozalandi",
            });

            if (query.message?.message_id) {
              await this.bot.editMessageText("🛒 Savatchangiz tozalandi.", {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                  inline_keyboard: [],
                },
              });
            }

            return;
          } catch (error) {
            console.error("CLEAR CART ERROR:", error);

            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Savatchani tozalashda xatolik",
            });

            return;
          }
        }

        if (data.startsWith("confirm_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.updateStatus(
            orderId,
            "confirmed",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "✅ Buyurtma tasdiqlandi",
          });

          await this.bot.sendMessage(
            order.user.chatId,
            `✅ Buyurtmangiz tasdiqlandi!\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `💰 Jami: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
              `📦 Holati: ✅ Tasdiqlandi`,
          );

          await this.bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  {
                    text: "👨‍🍳 Tayyorlanmoqda",
                    callback_data: `preparing_order:${order.id}`,
                  },
                ],
              ],
            },
            {
              chat_id: this.adminChatId,
              message_id: query.message!.message_id,
            },
          );

          return;
        }

        if (data.startsWith("preparing_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.updateStatus(
            orderId,
            "preparing",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "👨‍🍳 Tayyorlanmoqda",
          });

          await this.bot.sendMessage(
            order.user.chatId,
            `👨‍🍳 Buyurtmangiz tayyorlanmoqda.\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `📦 Holati: 👨‍🍳 Tayyorlanmoqda`,
          );

          await this.bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  {
                    text: "🚚 Yetkazilmoqda",
                    callback_data: `delivering_order:${order.id}`,
                  },
                ],
              ],
            },
            {
              chat_id: this.adminChatId,
              message_id: query.message!.message_id,
            },
          );

          return;
        }

        if (data.startsWith("delivering_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.updateStatus(
            orderId,
            "delivering",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "🚚 Yetkazilmoqda",
          });

          await this.bot.sendMessage(
            order.user.chatId,
            `🚚 Buyurtmangiz yo'lga chiqdi!\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `📦 Holati: 🚚 Yetkazilmoqda`,
          );

          await this.bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  {
                    text: "✅ Yetkazildi",
                    callback_data: `delivered_order:${order.id}`,
                  },
                ],
              ],
            },
            {
              chat_id: this.adminChatId,
              message_id: query.message!.message_id,
            },
          );

          return;
        }

        if (data.startsWith("delivered_order:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const orderId = Number(data.split(":")[1]);

          const order = await this.orderService.updateStatus(
            orderId,
            "delivered",
          );

          await this.bot.answerCallbackQuery(query.id, {
            text: "✅ Buyurtma yetkazildi",
          });

          await this.bot.sendMessage(
            order.user.chatId,
            `✅ BUYURTMANGIZ YETKAZILDI!\n\n` +
              `🧾 Buyurtma №: ${order.id}\n` +
              `💰 Jami: ${Number(order.totalPrice).toLocaleString()} so'm\n` +
              `📦 Holati: ✅ Yetkazildi`,
          );

          await this.bot.editMessageReplyMarkup(
            {
              inline_keyboard: [],
            },
            {
              chat_id: this.adminChatId,
              message_id: query.message!.message_id,
            },
          );

          return;
        }

        if (data.startsWith("delete_product:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const productId = Number(data.split(":")[1]);

          const product = await this.productRepository.findOne({
            where: {
              id: productId,
            },
          });

          if (!product) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Mahsulot topilmadi",
            });

            return;
          }

          await this.bot.answerCallbackQuery(query.id);

          await this.bot.sendMessage(
            chatId,
            `🗑 "${product.name}" mahsulotini o‘chirmoqchimisiz?`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Ha, o‘chirish",
                      callback_data: `confirm_delete_product:${product.id}`,
                    },
                    {
                      text: "❌ Bekor qilish",
                      callback_data: `cancel_delete_product:${product.id}`,
                    },
                  ],
                ],
              },
            },
          );

          return;
        }

        if (data.startsWith("confirm_delete_product:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz",
            });

            return;
          }

          const productId = Number(data.split(":")[1]);

          const product = await this.productRepository.findOne({
            where: {
              id: productId,
            },
          });

          if (!product) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Mahsulot topilmadi",
            });

            return;
          }

          const productName = product.name;

          await this.productRepository.remove(product);

          await this.bot.answerCallbackQuery(query.id, {
            text: "✅ Mahsulot o‘chirildi",
          });

          if (query.message) {
            await this.bot.editMessageText(
              `✅ "${productName}" mahsuloti o‘chirildi.`,
              {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                  inline_keyboard: [],
                },
              },
            );
          }

          return;
        }

        if (data.startsWith("cancel_delete_product:")) {
          await this.bot.answerCallbackQuery(query.id, {
            text: "❌ Bekor qilindi",
          });

          if (query.message) {
            await this.bot.editMessageText(
              "❌ Mahsulotni o‘chirish bekor qilindi.",
              {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                  inline_keyboard: [],
                },
              },
            );
          }

          return;
        }

        if (data.startsWith("edit_product:")) {
          if (query.from.id !== this.adminChatId) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Siz admin emassiz.",
            });

            return;
          }

          const productId = Number(data.split(":")[1]);

          const product = await this.productRepository.findOne({
            where: {
              id: productId,
            },
          });

          if (!product) {
            await this.bot.answerCallbackQuery(query.id, {
              text: "❌ Mahsulot topilmadi.",
            });

            return;
          }

          this.editProductData.set(chatId, {
            productId,
          });

          this.userState.set(chatId, "edit_name");

          await this.bot.answerCallbackQuery(query.id);

          await this.bot.sendMessage(
            chatId,
            `✏️ "${product.name}"ni tahrirlash\n\n` +
              `📝 Yangi mahsulot nomini yuboring:`,
          );

          return;
        }

        if (data.startsWith("cancel_order:")) {
          try {
            const orderId = Number(data.split(":")[1]);

            const order = await this.orderService.cancelOrder(chatId, orderId);

            await this.bot.answerCallbackQuery(query.id, {
              text: "🚫 Buyurtma bekor qilindi",
            });

            if (query.message) {
              await this.bot.editMessageReplyMarkup(
                {
                  inline_keyboard: [],
                },
                {
                  chat_id: chatId,
                  message_id: query.message.message_id,
                },
              );
            }

            await this.bot.sendMessage(
              chatId,
              `🚫 BUYURTMANGIZ BEKOR QILINDI!\n\n` +
                `🧾 Buyurtma №: ${order.id}\n` +
                `📦 Holati: 🚫 Bekor qilindi`,
            );

            return;
          } catch (error) {
            console.error("CANCEL ORDER ERROR:", error);

            await this.bot.answerCallbackQuery(query.id, {
              text:
                error instanceof Error
                  ? error.message
                  : "❌ Bekor qilishda xatolik",
            });

            return;
          }
        }

        if (data === "choose_payment") {
          await this.bot.answerCallbackQuery(query.id);

          await this.bot.sendMessage(chatId, "💳 To'lov turini tanlang:", {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💵 Naqd pul",
                    callback_data: "checkout:cash",
                  },
                ],
                [
                  {
                    text: "💳 Karta",
                    callback_data: "checkout:card",
                  },
                ],
              ],
            },
          });

          return;
        }
      } catch (error) {
        console.error("CALLBACK ERROR:", error);

        try {
          await this.bot.answerCallbackQuery(query.id, {
            text: "❌ Xatolik yuz berdi",
          });
        } catch {}
      }
    });
  }

  // =====================================================
  // ASOSIY MENU
  // =====================================================

  private async showMainMenu(chatId: number): Promise<void> {
    await this.bot.sendMessage(chatId, "🍔 Asosiy Menu", {
      reply_markup: {
        keyboard: [
          [
            {
              text: "🥤 Ichimliklar",
            },
            {
              text: "🍔 Yeguliklar",
            },
          ],
          [
            {
              text: "🍰 Shirinliklar",
            },
          ],
          [
            {
              text: "🛒 Savatcham",
            },
          ],
          [
            {
              text: "📦 Buyurtmalarim",
            },
          ],
        ],
        resize_keyboard: true,
      },
    });
  }

  private async showAdminOrders(chatId: number): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    const orders = await this.orderService.getPendingOrders();

    if (!orders.length) {
      await this.bot.sendMessage(chatId, "📦 Yangi buyurtmalar yo'q.");

      return;
    }

    for (const order of orders) {
      const statusText = this.getStatusText(order.status);

      // TO'LOV HOLATI
      const paymentText =
        order.paymentMethod === "cash"
          ? "💵 Naqd pul"
          : order.payment?.status === "paid"
            ? "💳 Karta ✅ To'langan"
            : "💳 Karta ⏳ To'lanmagan";

      let message =
        `🔔 YANGI BUYURTMA №${order.id}\n\n` +
        `👤 Mijoz: ${order.customerName || "Noma'lum"}\n` +
        `📞 Telefon: ${order.customerPhone || "Noma'lum"}\n` +
        `💳 To'lov: ${paymentText}\n` +
        `📦 Holati: ${statusText}\n\n`;

      message += "🛒 MAHSULOTLAR:\n\n";

      for (const item of order.items) {
        const price = Number(item.price);
        const subtotal = price * item.quantity;

        message +=
          `🍔 ${item.productName}\n` +
          `🔢 ${item.quantity} dona\n` +
          `💰 ${price.toLocaleString()} so'm\n` +
          `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;
      }

      message +=
        `━━━━━━━━━━━━━━\n` +
        `💰 UMUMIY: ${Number(order.totalPrice).toLocaleString()} so'm`;

      await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Tasdiqlash",
                callback_data: `confirm_order:${order.id}`,
              },
              {
                text: "❌ Rad etish",
                callback_data: `reject_order:${order.id}`,
              },
            ],
          ],
        },
      });

      if (order.latitude !== null && order.longitude !== null) {
        await this.bot.sendLocation(chatId, order.latitude, order.longitude);
      }
    }
  }

  private async showOrderHistory(chatId: number): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    try {
      const orders = await this.orderService.getOrderHistory();

      if (!orders.length) {
        await this.bot.sendMessage(chatId, "📊 Hali buyurtmalar mavjud emas.");

        return;
      }

      for (const order of orders) {
        const statusText = this.getStatusText(order.status);

        let message =
          `📊 BUYURTMA №${order.id}\n\n` +
          `👤 Mijoz: ${order.user.firstName || "Noma'lum"}\n` +
          `📞 Telefon: ${order.user.phone || "Noma'lum"}\n` +
          `📦 Status: ${statusText}\n\n`;

        message += "🛒 MAHSULOTLAR:\n\n";

        for (const item of order.items) {
          const subtotal = Number(item.price) * item.quantity;

          message +=
            `🍔 ${item.productName}\n` +
            `🔢 ${item.quantity} dona\n` +
            `💰 ${subtotal.toLocaleString()} so'm\n\n`;
        }

        message +=
          `━━━━━━━━━━━━━━\n` +
          `💵 UMUMIY: ${Number(order.totalPrice).toLocaleString()} so'm`;

        await this.bot.sendMessage(chatId, message);
      }
    } catch (error) {
      console.error("ORDER HISTORY ERROR:", error);

      await this.bot.sendMessage(
        chatId,
        "❌ Buyurtmalar tarixini olishda xatolik.",
      );
    }
  }

  // =====================================================
  // ICHIMLIKLAR
  // =====================================================

  private async showDrinks(chatId: number): Promise<void> {
    try {
      const drinks = await this.productRepository.find({
        where: {
          category: "drink",
        },
      });

      if (!drinks.length) {
        await this.bot.sendMessage(
          chatId,
          "🥤 Hozircha ichimliklar mavjud emas.",
        );

        return;
      }

      for (const item of drinks) {
        let photoSource: any;

        if (
          item.image.startsWith("http://") ||
          item.image.startsWith("https://")
        ) {
          photoSource = item.image;
        } else {
          const imagePath = path.join(
            process.cwd(),
            item.image.replace(/^[/\\]+/, ""),
          );

          if (!fs.existsSync(imagePath)) {
            await this.bot.sendMessage(
              chatId,
              `❌ ${item.name} mahsulotining rasmi topilmadi.`,
            );

            continue;
          }

          photoSource = fs.createReadStream(imagePath);
        }

        await this.bot.sendPhoto(chatId, photoSource, {
          caption:
            `🥤 ${item.name}\n\n` +
            `💰 Narxi: ${Number(item.price).toLocaleString()} so'm\n\n` +
            `📝 Tarkibi:\n${item.description}`,

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🛒 Buyurtma berish",
                  callback_data: `order:${item.id}`,
                },
              ],
            ],
          },
        });
      }
    } catch (error) {
      console.error("DRINKS ERROR:", error);

      await this.bot.sendMessage(chatId, "❌ Ichimliklarni yuklashda xatolik.");
    }
  }

  // =====================================================
  // YEGULIKLAR
  // =====================================================

  private async showFoods(chatId: number): Promise<void> {
    try {
      const foods = await this.productRepository.find({
        where: {
          category: "food",
        },
      });

      if (!foods.length) {
        await this.bot.sendMessage(
          chatId,
          "🍔 Hozircha yeguliklar mavjud emas.",
        );

        return;
      }

      for (const item of foods) {
        let photoSource: any;

        if (
          item.image.startsWith("http://") ||
          item.image.startsWith("https://")
        ) {
          photoSource = item.image;
        } else {
          const imagePath = path.join(
            process.cwd(),
            item.image.replace(/^[/\\]+/, ""),
          );

          if (!fs.existsSync(imagePath)) {
            await this.bot.sendMessage(
              chatId,
              `❌ ${item.name} mahsulotining rasmi topilmadi.`,
            );

            continue;
          }

          photoSource = fs.createReadStream(imagePath);
        }

        await this.bot.sendPhoto(chatId, photoSource, {
          caption:
            `🍔 ${item.name}\n\n` +
            `💰 Narxi: ${Number(item.price).toLocaleString()} so'm\n\n` +
            `📝 Tarkibi:\n${item.description}`,

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🛒 Buyurtma berish",
                  callback_data: `order:${item.id}`,
                },
              ],
            ],
          },
        });
      }
    } catch (error) {
      console.error("FOODS ERROR:", error);

      await this.bot.sendMessage(chatId, "❌ Yeguliklarni yuklashda xatolik.");
    }
  }

  // =====================================================
  // SHIRINLIKLAR
  // =====================================================

  private async showDesserts(chatId: number): Promise<void> {
    try {
      const desserts = await this.productRepository.find({
        where: {
          category: "dessert",
        },
      });

      if (!desserts.length) {
        await this.bot.sendMessage(
          chatId,
          "🍰 Hozircha shirinliklar mavjud emas.",
        );

        return;
      }

      for (const item of desserts) {
        let photoSource: any;

        if (
          item.image.startsWith("http://") ||
          item.image.startsWith("https://")
        ) {
          photoSource = item.image;
        } else {
          const imagePath = path.join(
            process.cwd(),
            item.image.replace(/^[/\\]+/, ""),
          );

          if (!fs.existsSync(imagePath)) {
            await this.bot.sendMessage(
              chatId,
              `❌ ${item.name} mahsulotining rasmi topilmadi.`,
            );

            continue;
          }

          photoSource = fs.createReadStream(imagePath);
        }

        await this.bot.sendPhoto(chatId, photoSource, {
          caption:
            `🍰 ${item.name}\n\n` +
            `💰 Narxi: ${Number(item.price).toLocaleString()} so'm\n\n` +
            `📝 Tarkibi:\n${item.description}`,

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🛒 Buyurtma berish",
                  callback_data: `order:${item.id}`,
                },
              ],
            ],
          },
        });
      }
    } catch (error) {
      console.error("DESSERTS ERROR:", error);

      await this.bot.sendMessage(
        chatId,
        "❌ Shirinliklarni yuklashda xatolik.",
      );
    }
  }

  private async showCart(chatId: number): Promise<void> {
    try {
      const cartItems = await this.cartService.getCart(chatId);

      if (!cartItems.length) {
        await this.bot.sendMessage(chatId, "🛒 Savatchangiz hozircha bo'sh.");

        return;
      }

      let productTotal = 0;
      let message = "🛒 SAVATCHANGIZ\n\n";

      const keyboard: Array<
        Array<{
          text: string;
          callback_data: string;
        }>
      > = [];

      for (const item of cartItems) {
        const price = Number(item.product.price);
        const quantity = item.quantity;
        const subtotal = price * quantity;

        productTotal += subtotal;

        message +=
          `🍔 ${item.product.name}\n` +
          `💰 Narxi: ${price.toLocaleString()} so'm\n` +
          `🔢 Soni: ${quantity}\n` +
          `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;

        // + / - tugmalari
        keyboard.push([
          {
            text: "➖",
            callback_data: `cart_minus:${item.id}`,
          },
          {
            text: `🔢 ${quantity}`,
            callback_data: "noop",
          },
          {
            text: "➕",
            callback_data: `cart_plus:${item.id}`,
          },
        ]);

        // O'chirish
        keyboard.push([
          {
            text: "🗑 O'chirish",
            callback_data: `cart_remove:${item.id}`,
          },
        ]);
      }

      const deliveryFee = Number(process.env.DELIVERY_FEE || 0);
      const totalPrice = productTotal + deliveryFee;

      message +=
        `━━━━━━━━━━━━━━\n` +
        `🛒 Mahsulotlar: ${productTotal.toLocaleString()} so'm\n` +
        `🚚 Yetkazib berish: ${deliveryFee.toLocaleString()} so'm\n` +
        `💰 JAMI: ${totalPrice.toLocaleString()} so'm`;
      keyboard.push([
        {
          text: "🗑 Savatchani tozalash",
          callback_data: "clear_cart",
        },
      ]);

      keyboard.push([
        {
          text: "✅ Buyurtmani tasdiqlash",
          callback_data: "choose_payment",
        },
      ]);

      await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      console.error("SHOW CART ERROR:", error);

      await this.bot.sendMessage(chatId, "❌ Savatchani ochishda xatolik.");
    }
  }

  private async showOrders(chatId: number): Promise<void> {
    try {
      const orders = await this.orderService.getUserOrders(chatId);

      if (!orders.length) {
        await this.bot.sendMessage(chatId, "📦 Sizda hali buyurtmalar yo'q.");

        return;
      }

      for (const order of orders) {
        // TO'LOV TURINI ANIQLAYMIZ
        const paymentText =
          order.paymentMethod === "cash" ? "💵 Naqd pul" : "💳 Karta";

        // STATUS
        const statusText = this.getStatusText(order.status);

        let message =
          `🧾 BUYURTMA №: ${order.id}\n\n` +
          `📦 Holati: ${statusText}\n` +
          `💳 To'lov: ${paymentText}\n` +
          `💰 Jami: ${Number(order.totalPrice).toLocaleString()} so'm\n\n`;

        message += "🛒 MAHSULOTLAR:\n\n";

        for (const item of order.items) {
          message += `🍔 ${item.productName} × ${item.quantity}\n`;
        }

        // Faqat pending bo'lsa bekor qilish
        const keyboard: Array<
          Array<{
            text: string;
            callback_data: string;
          }>
        > = [];

        if (order.status === "pending") {
          keyboard.push([
            {
              text: "❌ Buyurtmani bekor qilish",
              callback_data: `cancel_order:${order.id}`,
            },
          ]);
        }

        await this.bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
      }
    } catch (error) {
      console.error("SHOW ORDERS ERROR:", error);

      await this.bot.sendMessage(chatId, "❌ Buyurtmalarni olishda xatolik.");
    }
  }

  private async showAdminMenu(chatId: number): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    await this.bot.sendMessage(chatId, "👨‍💼 ADMIN PANEL", {
      reply_markup: {
        keyboard: [
          [
            {
              text: "📦 Yangi buyurtmalar",
            },
          ],
          [
            {
              text: "📊 Buyurtmalar tarixi",
            },
          ],
          [
            {
              text: "🔎 Status bo'yicha buyurtmalar",
            },
          ],
          [
            {
              text: "➕ Mahsulot qo'shish",
            },
          ],
          [
            {
              text: "🛠 Mahsulotlarni boshqarish",
            },
          ],
        ],
        resize_keyboard: true,
      },
    });
  }

  private async showOrderStatusMenu(chatId: number): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    await this.bot.sendMessage(chatId, "🔎 Buyurtma statusini tanlang:", {
      reply_markup: {
        keyboard: [
          [
            {
              text: "⏳ Kutilmoqda",
            },
            {
              text: "✅ Tasdiqlangan",
            },
          ],
          [
            {
              text: "👨‍🍳 Tayyorlanmoqda",
            },
            {
              text: "🚚 Yetkazilmoqda",
            },
          ],
          [
            {
              text: "✅ Yetkazilgan",
            },
            {
              text: "❌ Rad etilgan",
            },
          ],
          [
            {
              text: "🚫 Bekor qilingan",
            },
          ],
        ],
        resize_keyboard: true,
      },
    });
  }

  private async showOrdersByStatus(
    chatId: number,
    status:
      | "pending"
      | "confirmed"
      | "preparing"
      | "delivering"
      | "delivered"
      | "rejected"
      | "cancelled",
  ): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    try {
      const orders = await this.orderService.getOrdersByStatus(status);

      if (!orders.length) {
        await this.bot.sendMessage(
          chatId,
          `${this.getStatusText(status)} buyurtmalar mavjud emas.`,
        );

        return;
      }

      for (const order of orders) {
        let message =
          `🧾 BUYURTMA №${order.id}\n\n` +
          `👤 Mijoz: ${order.user.firstName || "Noma'lum"}\n` +
          `📞 Telefon: ${order.user.phone || "Noma'lum"}\n` +
          `📦 Status: ${this.getStatusText(order.status)}\n\n`;

        message += "🛒 MAHSULOTLAR:\n\n";

        for (const item of order.items) {
          const price = Number(item.price);

          const subtotal = price * item.quantity;

          message +=
            `🍔 ${item.productName}\n` +
            `🔢 ${item.quantity} dona\n` +
            `💰 ${price.toLocaleString()} so'm\n` +
            `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;
        }

        message +=
          `━━━━━━━━━━━━━━\n` +
          `💰 UMUMIY: ${Number(order.totalPrice).toLocaleString()} so'm`;

        await this.bot.sendMessage(chatId, message);
      }
    } catch (error) {
      console.error("GET ORDERS BY STATUS ERROR:", error);

      await this.bot.sendMessage(chatId, "❌ Buyurtmalarni olishda xatolik.");
    }
  }

  private async showAdminProducts(chatId: number): Promise<void> {
    if (chatId !== this.adminChatId) {
      await this.bot.sendMessage(chatId, "❌ Siz admin emassiz.");

      return;
    }

    const products = await this.productRepository.find({
      order: {
        id: "DESC",
      },
    });

    if (!products.length) {
      await this.bot.sendMessage(chatId, "📦 Mahsulotlar mavjud emas.");

      return;
    }

    for (const product of products) {
      await this.bot.sendMessage(
        chatId,
        `🆔 ID: ${product.id}\n` +
          `🍔 ${product.name}\n` +
          `💰 ${Number(product.price).toLocaleString()} so'm\n` +
          `📂 ${product.category}\n` +
          `📝 ${product.description}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✏️ Tahrirlash",
                  callback_data: `edit_product:${product.id}`,
                },
                {
                  text: "🗑 O'chirish",
                  callback_data: `delete_product:${product.id}`,
                },
              ],
            ],
          },
        },
      );
    }
  }

  private async updateCartMessage(
    chatId: number,
    messageId?: number,
  ): Promise<void> {
    if (!messageId) {
      return;
    }

    const cartItems = await this.cartService.getCart(chatId);

    // Savatcha butunlay bo'sh
    if (!cartItems.length) {
      await this.bot.editMessageText("🛒 Savatchangiz hozircha bo'sh.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [],
        },
      });

      return;
    }

    let productTotal = 0;
    let message = "🛒 SAVATCHANGIZ\n\n";

    const keyboard: Array<
      Array<{
        text: string;
        callback_data: string;
      }>
    > = [];

    for (const item of cartItems) {
      const price = Number(item.product.price);

      const quantity = item.quantity;

      const subtotal = price * quantity;

      productTotal += subtotal;

      message +=
        `🍔 ${item.product.name}\n` +
        `💰 Narxi: ${price.toLocaleString()} so'm\n` +
        `🔢 Soni: ${quantity}\n` +
        `💵 Jami: ${subtotal.toLocaleString()} so'm\n\n`;

      keyboard.push([
        {
          text: "➖",
          callback_data: `cart_minus:${item.id}`,
        },
        {
          text: `🔢 ${quantity}`,
          callback_data: "noop",
        },
        {
          text: "➕",
          callback_data: `cart_plus:${item.id}`,
        },
      ]);

      keyboard.push([
        {
          text: "🗑 O'chirish",
          callback_data: `cart_remove:${item.id}`,
        },
      ]);
    }

    const deliveryFee = Number(process.env.DELIVERY_FEE || 0);
    const totalPrice = productTotal + deliveryFee;

    message +=
      `━━━━━━━━━━━━━━\n` +
      `🛒 Mahsulotlar: ${productTotal.toLocaleString()} so'm\n` +
      `🚚 Yetkazib berish: ${deliveryFee.toLocaleString()} so'm\n` +
      `💰 JAMI: ${totalPrice.toLocaleString()} so'm`;

    keyboard.push([
      {
        text: "✅ Buyurtmani tasdiqlash",
        callback_data: "choose_payment",
      },
    ]);

    try {
      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      console.error("UPDATE CART ERROR:", error);
    }
  }

  private getStatusText(
    status:
      | "pending"
      | "confirmed"
      | "preparing"
      | "delivering"
      | "delivered"
      | "rejected"
      | "cancelled",
  ): string {
    switch (status) {
      case "pending":
        return "⏳ Kutilmoqda";

      case "confirmed":
        return "✅ Tasdiqlandi";

      case "preparing":
        return "👨‍🍳 Tayyorlanmoqda";

      case "delivering":
        return "🚚 Yetkazilmoqda";

      case "delivered":
        return "✅ Yetkazildi";

      case "rejected":
        return "❌ Rad etildi";

      case "cancelled":
        return "🚫 Bekor qilindi";

      default:
        return "❓ Noma'lum";
    }
  }
}
