const { epochFromDate } = require("./dateUtils");
const supabase = require("./supabase");
const { sendExpenseTaggedEmail } = require("./email");

function shapeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    data: row.data,
    isRead: row.is_read,
    createdAt: epochFromDate(row.created_at),
  };
}

async function notifyExpenseTagged({
  tripId,
  expenseId,
  expenseName,
  amount,
  payerId,
  payerName,
  participantUserIds,
}) {
  const taggedUserIds = participantUserIds.filter(
    (userId) => userId !== payerId,
  );
  if (taggedUserIds.length === 0) return;

  const [{ data: taggedProfiles }, { data: trip }] = await Promise.all([
    supabase.from("profiles").select("email").in("id", taggedUserIds),
    supabase.from("trips").select("name, currency").eq("id", tripId).single(),
  ]);

  const { error: notifyError } = await supabase.from("notifications").insert(
    taggedUserIds.map((userId) => ({
      user_id: userId,
      type: "expense_tagged",
      reference_type: "expense",
      reference_id: expenseId,
      data: {
        tripId,
        expenseId,
        expenseName,
        amount,
        currency: trip?.currency,
        paidByName: payerName,
      },
    })),
  );

  if (notifyError)
    console.warn(
      `[notifications] failed to create expense_tagged notifications: ${notifyError.message}`,
    );

  for (const { email: taggedEmail } of taggedProfiles || []) {
    const { ok, error: emailError } = await sendExpenseTaggedEmail({
      to: taggedEmail,
      tripName: trip?.name || "a trip",
      expenseName,
      payerName,
      amount,
      currency: trip?.currency,
    });

    if (!ok)
      console.warn(
        `[expense email] failed to send to ${taggedEmail}: ${emailError}`,
      );
  }
}

module.exports = { shapeNotification, notifyExpenseTagged };
