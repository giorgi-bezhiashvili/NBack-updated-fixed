import { Router, type Request, type RequestHandler, type Response } from "express";
import project from "../models/projectSchema.js"; 
import { authenticateToken } from "../middleware/authenticateToken.js";
const router = Router();
import { validate } from "../middleware/validate.js";
import Joi from 'joi';
import { requireRole } from "../middleware/authorize.js"; // Import role middleware

// 1. Correct TypeScript Interface syntax
interface projectPost {
   topic: string;
  description: string;
  projectAuthor:string;
  grade:number;
  url:string;
  urlName:string;
}

// 2. Correct Joi Schema (with array validation)
const projectSchema = Joi.object<projectPost>({
  topic: Joi.string().required(),
  description: Joi.string().required(),
  grade: Joi.number().required(),
  url: Joi.string().uri().optional(),
  urlName: Joi.string().optional(),
  projectAuthor:Joi.string().required()
});
router.get("/", async (req: Request, res: Response)=> {
  try {
    const projects = await project.find({});
    res.status(200).json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/",authenticateToken, requireRole("teacher") as RequestHandler,validate<projectPost>(projectSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const newProject = new project(req.body);
    const savedProject = await newProject.save();
    res.status(201).json(savedProject);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});

router.patch("/:id", authenticateToken, requireRole("teacher") as RequestHandler, validate<projectPost>(projectSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const updatedProject = await project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedProject) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(200).json(updatedProject);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});

router.delete("/:id", authenticateToken, requireRole("teacher") as RequestHandler, async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedProject = await project.findByIdAndDelete(req.params.id);
    if (!deletedProject) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(200).json({ message: "Project deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router