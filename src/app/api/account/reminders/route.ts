import { memberRoute } from "@/lib/api.server";
import { reminderSchema } from "@/lib/account";
import { updateReminders } from "@/lib/account.server";

// Saves Reminder settings to her own reminder_prefs row (her client, row-level security).
export async function POST(request: Request) {
  return memberRoute("account_reminders", request, reminderSchema, updateReminders);
}
