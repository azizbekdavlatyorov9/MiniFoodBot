import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class Product{

    @Prop()
    name!:string

    @Prop()
    price!:number

    @Prop()
    description!:string

    @Prop()
    image!:string

    @Prop({
        enum:["drink","food","dessert"]
    })
    category!:string
}

export const ProductSchema=SchemaFactory.createForClass(Product)