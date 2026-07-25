import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFormula extends Document {
  topic: string;
  equation: string[];
  grade:number;
  url:string;
  urlName:string;
}

const formulaSchema = new Schema<IFormula>({
  topic: { type: String, required: true },
  equation: { type: [String], required: true },
  grade: { type: Number, required: true },
  url:{type:String},
  urlName:{type:String},
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
const Formula = mongoose.model<IFormula>("Formula", formulaSchema);
export default Formula;