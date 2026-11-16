import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILesson extends Document {
  topic: string;
  grade:number;
  description: string;
  url:string;
  urlName:string;
}

const lessonSchema = new Schema<ILesson>({
  topic: { type: String, required: true },
  description: { type: String, required: true },
  grade: { type: Number, required: true },
  url:{type:String},
  urlName:{type:String},
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
const Lesson = mongoose.model<ILesson>("Lesson", lessonSchema);
export default Lesson;