const { renderTemplate } = require('./renderTemplate');

const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY is not set' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Voyage <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// tripName/inviterName are user-controlled (a trip's name, an account's display name) —
// escape before dropping them into HTML so a name like `Bob & <Alice>` can't break markup.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendInviteEmail({ to, tripName, inviterName, role }) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const subject = `${inviterName} invited you to "${tripName}" on Voyage`;

  const html = renderTemplate('inviteEmail.html', {
    tripName: escapeHtml(tripName),
    inviterName: escapeHtml(inviterName),
    role: escapeHtml(role),
    frontendUrl,
  });
  const text = renderTemplate('inviteEmail.txt', { tripName, inviterName, role, frontendUrl });

  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendInviteEmail };
