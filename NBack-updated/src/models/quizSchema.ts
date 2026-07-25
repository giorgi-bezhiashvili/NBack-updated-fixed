import mongoose, { Schema, Document, Types } from "mongoose";

export interface IQuiz extends Document {
  topic: string;
  assignment: string;
  answers: string[];
  realAnswer: string;
  grade:number;
  url:string;
  explanation:string;
  urlName:string;
}

const quizSchema = new Schema<IQuiz>({
  topic: { type: String, required: true },
  assignment: { type: String, required: true },
  answers: { type: [String]},
  realAnswer: { type: String},
  grade: { type: Number, required: true },
  explanation: { type: String, required: true },
  url:{type:String},
  urlName:{type:String},
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
const Quiz = mongoose.model<IQuiz>("quiz", quizSchema);
export default Quiz;