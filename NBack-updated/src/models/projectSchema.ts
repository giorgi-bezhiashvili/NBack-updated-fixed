import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProject extends Document {
  topic: string;
  description: string;
  projectAuthor:string;
  grade:number;
  url:string;
  urlName:string;
  author:string;
}

const projectSchema = new Schema<IProject>({
  topic: { type: String, required: true },
  description: { type: String, required: true },
  projectAuthor:{type:String},
  grade: { type: Number, required: true },
  url:{type:String},
  urlName:{type:String},
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
const Projects = mongoose.model<IProject>("project", projectSchema);
export default Projects;