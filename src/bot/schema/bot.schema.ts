import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type UserDocument = User & Document 

@Schema()
export class User {
  @Prop()
  chatId!:number;

  @Prop()
  firstName!:string;

  
}

export const UserSchema = SchemaFactory.createForClass(User)