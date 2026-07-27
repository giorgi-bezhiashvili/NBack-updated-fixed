import { Router, type Request, type Response, type RequestHandler } from "express";
import mongoose from "mongoose";
import Joi from "joi";
import User, { type SavedItemType } from "../models/userSchema.js";
import Formula from "../models/formulaSchema.js";
import Projects from "../models/projectSchema.js";
import Quiz from "../models/quizSchema.js";
import { authenticateToken } from "../middleware/authenticateToken.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const SAVED_ITEM_TYPES: SavedItemType[] = ["formula", "project", "quiz"];

// Maps each saved-item type to the model that actually stores that content.
// Lets /api/saved fetch and validate against the right collection generically.
const MODEL_MAP: Record<SavedItemType, mongoose.Model<any>> = {
  formula: Formula,
  project: Projects,
  quiz: Quiz,
};

interface SavedItemBody {
  itemType: SavedItemType;
  itemId: string;
}

const savedItemBodySchema = Joi.object<SavedItemBody>({
  itemType: Joi.string().valid(...SAVED_ITEM_TYPES).required(),
  itemId: Joi.string().hex().length(24).required(),
});

// GET /api/saved
// Returns the logged-in user's saved items, grouped by type and populated
// with the actual formula/project/quiz documents (not just bare ids).
router.get("/", authenticateToken as RequestHandler, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ userName: req.user!.userName }).select("saved");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const idsByType: Record<SavedItemType, string[]> = { formula: [], project: [], quiz: [] };
    for (const item of user.saved) {
      idsByType[item.itemType].push(item.itemId.toString());
    }

    const [formulas, projects, quizzes] = await Promise.all([
      Formula.find({ _id: { $in: idsByType.formula } }),
      Projects.find({ _id: { $in: idsByType.project } }),
      Quiz.find({ _id: { $in: idsByType.quiz } }),
    ]);

    res.status(200).json({ formulas, projects, quizzes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/saved
// Body: { itemType: "formula" | "project" | "quiz", itemId: "<mongo id>" }
// Adds an item to the user's saved list. Safe to call twice — $addToSet
// means saving the same item again is a no-op, not a duplicate.
router.post(
  "/",
  authenticateToken as RequestHandler,
  validate<SavedItemBody>(savedItemBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { itemType, itemId } = req.body as SavedItemBody;

      // Make sure the thing being saved actually exists before we
      // reference it, so "saved" never points at a dead id.
      const targetExists = await MODEL_MAP[itemType].exists({ _id: itemId });
      if (!targetExists) {
        res.status(404).json({ error: `${itemType} not found` });
        return;
      }

      const updatedUser = await User.findOneAndUpdate(
        { userName: req.user!.userName },
        { $addToSet: { saved: { itemType, itemId: new mongoose.Types.ObjectId(itemId) } } },
        { new: true },
      ).select("saved");

      if (!updatedUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(201).json({ message: "Saved successfully", saved: updatedUser.saved });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/saved/:itemType/:itemId
// Removes an item from the user's saved list.
router.delete(
  "/:itemType/:itemId",
  authenticateToken as RequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { itemType, itemId } = req.params;

      if (typeof itemType !== "string" || typeof itemId !== "string") {
        res.status(400).json({ error: "Invalid parameters" });
        return;
      }
      if (!SAVED_ITEM_TYPES.includes(itemType as SavedItemType)) {
        res.status(400).json({ error: "Invalid item type" });
        return;
      }
      if (!mongoose.isValidObjectId(itemId)) {
        res.status(400).json({ error: "Invalid item id" });
        return;
      }

      const updatedUser = await User.findOneAndUpdate(
        { userName: req.user!.userName },
        { $pull: { saved: { itemType, itemId: new mongoose.Types.ObjectId(itemId) } } },
        { new: true },
      ).select("saved");

      if (!updatedUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ message: "Removed successfully", saved: updatedUser.saved });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;