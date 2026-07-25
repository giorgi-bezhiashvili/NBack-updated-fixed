import { Router, type Request, type Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken.js";
import { validate } from "../middleware/validate.js";
import Joi from "joi";
import Quiz from "../models/quizSchema.js";

const router = Router();

interface QuizPost {
  topic: string;
  assignment: string; // the question text
  answers: string[];  // empty or 1 item => free-response textbox; 2+ => multiple choice
  realAnswer: string;
  grade: number;
  url?: string;
  urlName?: string;
  explanation: string;
}

const quizSchema = Joi.object<QuizPost>({
  topic: Joi.string().required(),
  assignment: Joi.string().required(),
  answers: Joi.array().items(Joi.string()).default([]),
  realAnswer: Joi.string().required(),
  grade: Joi.number().required(),
  url: Joi.string().uri().optional(),
  urlName: Joi.string().optional(),
  explanation: Joi.string().required(),
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const quizzes = await Quiz.find({});
    res.status(200).json(quizzes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/",
  authenticateToken,
  validate<QuizPost>(quizSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const newQuiz = new Quiz(req.body);
      const savedQuiz = await newQuiz.save();
      res.status(201).json(savedQuiz);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Invalid data provided" });
    }
  },
);

router.patch(
  "/:id",
  authenticateToken,
  validate<QuizPost>(quizSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!updatedQuiz) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }
      res.status(200).json(updatedQuiz);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Invalid data provided" });
    }
  },
);

router.delete(
  "/:id",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedQuiz = await Quiz.findByIdAndDelete(req.params.id);
      if (!deletedQuiz) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }
      res.status(200).json({ message: "Quiz deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;