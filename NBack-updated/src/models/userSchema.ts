import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  userName: string;
  password: string;
}

const userSchema = new Schema<IUser>({
  userName: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model<IUser>("User", userSchema);
export default User;
