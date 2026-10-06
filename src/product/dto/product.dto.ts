import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(["drink", "food", "dessert"])
  category!: "drink" | "food" | "dessert";
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(["drink", "food", "dessert"])
  category?: "drink" | "food" | "dessert";
}