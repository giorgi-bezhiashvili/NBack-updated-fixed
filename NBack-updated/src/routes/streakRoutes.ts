// routes/streakRoutes.ts
import { Router, type Response, type Request } from "express";
import User from "../models/userSchema.js";
import { authenticateToken } from "../middleware/authenticateToken.js";

const router = Router();
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userName = req.user?.userName;
    if (!userName) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findOne({ userName });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ streak: user.streak, lastLogin: user.lastLogin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
router.post("/update-streak", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userName = req.user?.userName;
    if (!userName) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findOne({ userName });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const now = new Date();
    const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;

    if (!lastLogin) {
      // First login ever
      user.streak = 1;
      user.lastLogin = now;
    } else {
      // Normalize dates to midnight to compare calendar days
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const last = new Date(lastLogin.getFullYear(), lastLogin.getMonth(), lastLogin.getDate());

      const diffInDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

      if (diffInDays === 1) {
        // Logged in on the next consecutive day: increase streak
        user.streak += 1;
        user.lastLogin = now;
      } else if (diffInDays > 1) {
        // Missed one or more days: reset streak to 1
        user.streak = 1;
        user.lastLogin = now;
      }
      // If diffInDays === 0, user already logged in today; do not update streak or lastLogin
    }

    await user.save();

    res.status(200).json({
      message: "Streak updated successfully",
      streak: user.streak,
      lastLogin: user.lastLogin,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;