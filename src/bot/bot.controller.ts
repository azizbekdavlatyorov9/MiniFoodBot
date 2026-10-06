import { Controller, Get } from "@nestjs/common";
import { BotService } from "./bot.service";

@Controller("bot")
export class BotController {
  constructor(
    private readonly botService: BotService,
  ) {}

  @Get()
  getBotStatus() {
    return {
      message: "MiniFoodBot ishlayapti ✅",
    };
  }
}