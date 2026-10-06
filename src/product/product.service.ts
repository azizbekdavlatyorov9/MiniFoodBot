import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Product } from "./entities/product.entity";
import {
  CreateProductDto,
  UpdateProductDto,
} from "./dto/product.dto";

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  // =========================
  // CREATE
  // =========================

  async create(
  dto: CreateProductDto,
  image: Express.Multer.File,
): Promise<Product> {
  if (!image) {
    throw new BadRequestException(
      "Mahsulot rasmi majburiy",
    );
  }

  const product = this.productRepository.create({
    name: dto.name,
    price: dto.price,
    description: dto.description,
    category: dto.category,
    image: `/uploads/${image.filename}`,
  });

  return await this.productRepository.save(product);
}

  // =========================
  // GET ALL
  // =========================

  async findAll(): Promise<Product[]> {
    return await this.productRepository.find({
      order: {
        id: "DESC",
      },
    });
  }

  // =========================
  // GET ONE
  // =========================

  async findOne(id: number): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: {
        id,
      },
    });

    if (!product) {
      throw new NotFoundException(
        "Mahsulot topilmadi",
      );
    }

    return product;
  }

  // =========================
  // GET BY CATEGORY
  // =========================

  async findByCategory(
    category: "drink" | "food" | "dessert",
  ): Promise<Product[]> {
    return await this.productRepository.find({
      where: {
        category,
      },
      order: {
        id: "DESC",
      },
    });
  }

  // =========================
  // UPDATE
  // =========================

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(id);

    Object.assign(product, updateProductDto);

    return await this.productRepository.save(product);
  }

  // =========================
  // DELETE
  // =========================

  async remove(id: number): Promise<{ message: string }> {
    const product = await this.findOne(id);

    await this.productRepository.remove(product);

    return {
      message: "Mahsulot o'chirildi",
    };
  }
}