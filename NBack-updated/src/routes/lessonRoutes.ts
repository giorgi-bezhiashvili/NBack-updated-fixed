import { Router, type Request, type Response, type RequestHandler } from "express";
import Lesson from "../models/lessonSchema.js";
import { authenticateToken } from "../middleware/authenticateToken.js";
const router = Router();
import { validate } from "../middleware/validate.js";
import Joi from 'joi';
import { requireRole } from "../middleware/authorize.js";
import lessonSchema from "../models/lessonSchema.js";

interface LessonInput {
  topic: string;
  grade:number;
  description: string;
  url:string;
  urlName:string;
}
const lessonInputSchema = Joi.object<LessonInput>({
  topic: Joi.string().required(),
  grade: Joi.number().required(),
  description: Joi.string().required(),
  url: Joi.string().uri().optional(),
  urlName: Joi.string().optional(),
});
router.post("/", authenticateToken as RequestHandler, requireRole("teacher") as RequestHandler, validate(lessonInputSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const newLesson = new Lesson(req.body);
    const savedLesson = await newLesson.save();
    res.status(201).json(savedLesson);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const lessons = await Lesson.find({});
    res.json(lessons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id",async(req:Request,res:Response)=>{
    try{
        const Lesson = await lessonSchema.findById(req.params.id)
        if(!Lesson){
            res.status(404).json({error:"Lesson was not found"})
        }
        res.status(200).send(Lesson)
    }catch(err){
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
})

router.patch("/:id", authenticateToken as RequestHandler, requireRole("teacher") as RequestHandler, validate(lessonInputSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const updatedLesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedLesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.json(updatedLesson);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});
export default router;