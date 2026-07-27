import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import type { Profile } from "passport";
import User from "../models/userSchema.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      callbackURL: requireEnv("GOOGLE_CALLBACK_URL"), // e.g. https://yourdomain.com/auth/google/callback
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (err: Error | null, user?: unknown) => void,
    ) => {
      try {
        const email =
          typeof profile.emails?.[0]?.value === "string"
            ? profile.emails[0].value.toLowerCase()
            : undefined;

        let user = await User.findOne({
          $or: [{ googleId: profile.id }, ...(email ? [{ email }] : [])],
        });

        if (!user) {
          user = new User({
            googleId: profile.id,
            userName: email ?? `google_${profile.id}`,
            email,
            role: "user",
            // no password field — schema should make it optional when googleId is set
          });
          await user.save();
        } else {
          const existingUser = user as any;
          if (!existingUser.googleId) {
            existingUser.googleId = profile.id;
            await existingUser.save();
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);