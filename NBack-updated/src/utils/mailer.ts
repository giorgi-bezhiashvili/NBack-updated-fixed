import nodemailer from "nodemailer";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: requireEnv("SMTP_USER"),
        pass: requireEnv("SMTP_PASS"),
      },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const fromAddress = process.env.MAIL_FROM ?? requireEnv("SMTP_USER");

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: "Reset your Newton password",
    text: `We received a request to reset your password. Open this link to choose a new one:\n\n${resetLink}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: 'Nunito', sans-serif; max-width: 480px; margin: 0 auto; color: #292524;">
        <h2 style="color:#78350f; font-family: 'DM Serif Display', serif;">Reset your password</h2>
        <p>We received a request to reset your Newton account password.</p>
        <p>
          <a href="${resetLink}"
             style="display:inline-block;padding:10px 22px;background:#78350f;color:#fff;
                    text-decoration:none;border-radius:6px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p style="font-size:13px;color:#57534e;">Or paste this link into your browser:<br>${resetLink}</p>
        <p style="color:#a8a29e;font-size:12px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}