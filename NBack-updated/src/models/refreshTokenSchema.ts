import mongoose, { Schema, Document } from "mongoose";

export interface IRefreshToken extends Document {
  tokenHash: string;
  userName: string;
  familyId: string;
  used: boolean;
  createdAt: Date;
  updatedAt: Date; 
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userName: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: "7d" },
  },
  { timestamps: true } // <-- Adds updatedAt & createdAt automatically
);
export default mongoose.model<IRefreshToken>(
  "RefreshToken",
  refreshTokenSchema,
);