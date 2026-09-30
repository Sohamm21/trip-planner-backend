const { renderTemplate } = require("./renderTemplate");

const RESEND_API_URL = "https://api.resend.com/emails";

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:
          process.env.RESEND_FROM_EMAIL || "BhatakGo <onboarding@resend.dev>",
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendInviteEmail({ to, tripName, inviterName, role, hasAccount }) {
  const frontendUrl = process.env.FRONTEND_URL;
  const subject = `${inviterName} invited you to "${tripName}" on BhatakGo`;

  if (!hasAccount) {
    const registerUrl = `${frontendUrl}/register`;
    const html = renderTemplate("inviteNewUserEmail.html", {
      tripName: escapeHtml(tripName),
      inviterName: escapeHtml(inviterName),
      role: escapeHtml(role),
      inviteeEmail: escapeHtml(to),
      registerUrl,
    });
    const text = renderTemplate("inviteNewUserEmail.txt", {
      tripName,
      inviterName,
      role,
      inviteeEmail: to,
      registerUrl,
    });

    return sendEmail({ to, subject, html, text });
  }

  const html = renderTemplate("inviteEmail.html", {
    tripName: escapeHtml(tripName),
    inviterName: escapeHtml(inviterName),
    role: escapeHtml(role),
    frontendUrl,
  });
  const text = renderTemplate("inviteEmail.txt", {
    tripName,
    inviterName,
    role,
    frontendUrl,
  });

  return sendEmail({ to, subject, html, text });
}

function sendSettlementEmail({
  to,
  tripName,
  payerName,
  amount,
  currency,
  note,
}) {
  const frontendUrl = process.env.FRONTEND_URL;
  const formattedAmount =
    `${currency || ""} ${Number(amount).toFixed(2)}`.trim();
  const subject = `${payerName} paid you back ${formattedAmount} on "${tripName}"`;

  const noteSection = note
    ? `<p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;font-style:italic;">"${escapeHtml(note)}"</p>`
    : "";
  const noteSuffix = note ? ` Note: "${note}"` : "";

  const html = renderTemplate("settlementEmail.html", {
    tripName: escapeHtml(tripName),
    payerName: escapeHtml(payerName),
    amount: formattedAmount,
    noteSection,
    frontendUrl,
  });
  const text = renderTemplate("settlementEmail.txt", {
    tripName,
    payerName,
    amount: formattedAmount,
    noteSuffix,
    frontendUrl,
  });

  return sendEmail({ to, subject, html, text });
}

function sendExpenseTaggedEmail({
  to,
  tripName,
  expenseName,
  payerName,
  amount,
  currency,
}) {
  const frontendUrl = process.env.FRONTEND_URL;
  const formattedAmount =
    `${currency || ""} ${Number(amount).toFixed(2)}`.trim();
  const subject = `${payerName} added "${expenseName}" and tagged you on "${tripName}"`;

  const html = renderTemplate("expenseTaggedEmail.html", {
    tripName: escapeHtml(tripName),
    expenseName: escapeHtml(expenseName),
    payerName: escapeHtml(payerName),
    amount: formattedAmount,
    frontendUrl,
  });
  const text = renderTemplate("expenseTaggedEmail.txt", {
    tripName,
    expenseName,
    payerName,
    amount: formattedAmount,
    frontendUrl,
  });

  return sendEmail({ to, subject, html, text });
}

module.exports = {
  sendEmail,
  sendInviteEmail,
  sendSettlementEmail,
  sendExpenseTaggedEmail,
};
