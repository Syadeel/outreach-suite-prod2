import nodemailer from 'nodemailer';

interface SendMailParams {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  messageId?: string; // For threading follow-up emails
}

/**
 * Sends an email using standard SMTP.
 */
export async function sendEmail({
  host,
  port,
  user,
  pass,
  from,
  to,
  subject,
  html,
  replyTo,
  messageId,
}: SendMailParams): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587/other ports
    auth: {
      user,
      pass,
    },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to,
    subject,
    html,
    replyTo,
  };

  // If this is a reply / follow-up, we can thread it
  if (messageId) {
    mailOptions.headers = {
      'In-Reply-To': messageId,
      'References': messageId,
    };
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}
