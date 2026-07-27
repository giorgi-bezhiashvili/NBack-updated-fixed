import mongoose, { Schema, Document, Types } from "mongoose";

export type SavedItemType = "formula" | "project" | "quiz";

export interface ISavedItem {
  itemType: SavedItemType;
  itemId: Types.ObjectId;
}

export interface IUser extends Document {
  userName: string;
  email: string;
  password?: string;
  googleId?: string;
  role: string;
  saved: ISavedItem[];
  doneQuizes: Types.ObjectId[];
  streak:number;
  lastLogin: Date;
}

const savedItemSchema = new Schema<ISavedItem>(
  {
    itemType: { type: String, enum: ["formula", "project", "quiz"], required: true },
    itemId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>({
  userName: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: {
    type: String,
    required: function (this: IUser) {
      return !this.googleId;
    },
  },
  googleId: { type: String, unique: true, sparse: true },
  role: { type: String, required: true , default: "user"},
  streak: { type: Number, default: 0 },
  lastLogin: { type: Date, default: null },
  saved: { type: [savedItemSchema], default: [] },
  doneQuizes: { type: [Schema.Types.ObjectId], default: [] },
});

const User = mongoose.model<IUser>("User", userSchema);
export default User;