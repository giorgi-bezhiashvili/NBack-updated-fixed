import mongoose, { Schema, Document } from "mongoose";

export interface IPasswordResetToken extends Document {
  tokenHash: string;
  userName: string;
  used: boolean;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>({
  tokenHash: { type: String, required: true, unique: true },
  userName: { type: String, required: true, index: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: "15m" },
});

export default mongoose.model<IPasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema,
);