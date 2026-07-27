import { Router, type Request, type Response, type RequestHandler } from "express";
import Formula from "../models/formulaSchema.js"; 
import { authenticateToken } from "../middleware/authenticateToken.js";
const router = Router();
import { validate } from "../middleware/validate.js";
import Joi from 'joi';
import { requireRole } from "../middleware/authorize.js"; 

// 1. Updated Interface (matching property names)
interface FormulaPost {
  topic: string;
  equation: string[];
  grade: number;
  url?: string;
  urlName?: string;
}

// 2. Corrected Joi Schema
const formulaSchema = Joi.object<FormulaPost>({
  topic: Joi.string().required(),
  equation: Joi.array().items(Joi.string()).required(),
  grade: Joi.number().required(),
  url: Joi.string().uri().optional(),
  urlName: Joi.string().optional(),
});
router.get("/", async (req: Request, res: Response)=> {
  try {
    const formulas = await Formula.find({});
    res.status(200).json(formulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.post("/", authenticateToken as RequestHandler, requireRole("teacher") as RequestHandler, validate<FormulaPost>(formulaSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const newFormula = new Formula(req.body);
    const savedFormula = await newFormula.save();
    res.status(201).json(savedFormula);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});

router.patch("/:id", authenticateToken as RequestHandler, requireRole("teacher") as RequestHandler, validate<FormulaPost>(formulaSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const updatedFormula = await Formula.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedFormula) {
      res.status(404).json({ error: "Formula not found" });
      return;
    }
    res.status(200).json(updatedFormula);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid data provided" });
  }
});

router.delete("/:id", authenticateToken as RequestHandler, requireRole("teacher") as RequestHandler, async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedFormula = await Formula.findByIdAndDelete(req.params.id);
    if (!deletedFormula) {
      res.status(404).json({ error: "Formula not found" });
      return;
    }
    res.status(200).json({ message: "Formula deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;