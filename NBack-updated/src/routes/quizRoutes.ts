import { Router, type Request, type RequestHandler, type Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken.js";
import { validate } from "../middleware/validate.js";
import Joi from "joi";
import Quiz from "../models/quizSchema.js";
import { requireRole } from "../middleware/authorize.js"; // Import role middleware
import User from "../models/userSchema.js";
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

// GET /api/quiz/done
// Returns the logged-in user's completed quizzes, populated with the full
// quiz documents (not just bare ids) — mirrors the pattern in savedRoutes.ts.
router.get("/done", authenticateToken as RequestHandler, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Looked up by userName, not _id — the access token payload only ever
    // contains { userName, role }, so req.user._id is always undefined.
    const dbUser = await User.findOne({ userName: req.user.userName }).select("doneQuizes");
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const doneQuizzes = await Quiz.find({ _id: { $in: dbUser.doneQuizes } });
    res.status(200).json(doneQuizzes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/",
  authenticateToken,
  requireRole("teacher") as RequestHandler,
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
  requireRole("teacher") as RequestHandler,
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
  requireRole("teacher") as RequestHandler,
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

// PUT /api/quiz/:id
// Marks a quiz as "done" for the logged-in user. No body needed — the quiz
// id comes from the URL.
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const quizId = req.params.id;
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }
    // Looked up by userName, not _id — see the note in GET /done above.
    const updatedUser = await User.findOneAndUpdate(
      { userName: req.user.userName },
      { $addToSet: { doneQuizes: quiz._id } },
      { new: true },
    ).select("doneQuizes");
    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(200).json({ message: "Quiz marked as done", doneQuizes: updatedUser.doneQuizes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;