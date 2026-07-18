import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'mock_key');

// PHASE 3: Sanitize Email Injections
export const escapeHTML = (str: string) => 
  str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );

export const sendEmail = async (to: string, subject: string, html: string) => {
  if (!process.env.RESEND_API_KEY) {
    return console.log(`[Mock Email] To: ${to} | Subject: ${subject}`);
  }
  try {
    await resend.emails.send({
      from: 'FinalFrame Notifications <onboarding@resend.dev>', 
      to, 
      subject, 
      html
    });
  } catch(e) { console.error("Email delivery failed:", e); }
};