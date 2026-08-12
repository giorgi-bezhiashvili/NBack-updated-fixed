import { Router, type Response, type Request } from "express";
import User from "../models/userSchema.js";
import { authenticateToken } from "../middleware/authenticateToken.js";

const router = Router();

// Helper to get UTC midnight for accurate day comparison
const getUTCMidnight = (date: Date): number => {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

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

router.post(
  "/update-streak",
  authenticateToken,
  async (req: Request, res: Response) => {
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
        const todayUTCMidnight = getUTCMidnight(now);
        const lastUTCMidnight = getUTCMidnight(lastLogin);

        // Difference in days using UTC timestamps
        const diffInDays = Math.floor(
          (todayUTCMidnight - lastUTCMidnight) / (1000 * 60 * 60 * 24),
        );

        if (diffInDays === 1) {
          // Consecutive day: increment streak
          user.streak += 1;
          user.lastLogin = now;
        } else if (diffInDays > 1) {
          // Missed one or more days: reset streak to 0
          user.streak = 1;
          user.lastLogin = now;
        }
        // If diffInDays === 0, user already logged in today; retain current streak and lastLogin
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
  },
);

router.post(
  "/reset-streak",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userName = req.user?.userName;
      if (!userName) return res.status(401).json({ error: "Unauthorized" });

      const user = await User.findOne({ userName });
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.streak === 0 && user.lastLogin === null) {
        return res.status(400).json({ error: "Streak is already reset" });
      }

      // Explicitly reset the user's streak
      user.streak = 0;
      user.lastLogin = null;
      await user.save();

      res.status(200).json({
        message: "Streak reset successfully",
        streak: user.streak,
        lastLogin: user.lastLogin,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
