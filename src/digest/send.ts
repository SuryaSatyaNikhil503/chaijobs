import nodemailer from "nodemailer";
import type { RenderedDigest } from "./render.js";

/** Sends the digest from the user's Gmail address to the same address. The only email chaijobs sends. */
export async function sendDigest(m: RenderedDigest, smtp: { user: string; pass: string }): Promise<void> {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({
    from: smtp.user,
    to: smtp.user,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
}
