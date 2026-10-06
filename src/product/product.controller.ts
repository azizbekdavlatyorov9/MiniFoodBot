import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";

import { ProductService } from "./product.service";

import {
  CreateProductDto,
  UpdateProductDto,
} from "./dto/product.dto";

@Controller("products")
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("image", {
      storage: diskStorage({
        destination: "./uploads/images",

        filename: (req, file, cb) => {
          const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}` +
            extname(file.originalname);

          cb(null, uniqueName);
        },
      }),

      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          return cb(
            new Error("Faqat rasm yuklash mumkin"),
            false,
          );
        }

        cb(null, true);
      },

      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Body() dto: CreateProductDto,

    @UploadedFile() image: Express.Multer.File,
  ) {
    return await this.productService.create(
      dto,
      image,
    );
  }

  @Get()
  async findAll() {
    return await this.productService.findAll();
  }

  @Get("category/:category")
  async findByCategory(
    @Param("category")
    category: "drink" | "food" | "dessert",
  ) {
    return await this.productService.findByCategory(
      category,
    );
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return await this.productService.findOne(id);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,

    @Body() dto: UpdateProductDto,
  ) {
    return await this.productService.update(
      id,
      dto,
    );
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return await this.productService.remove(id);
  }
}