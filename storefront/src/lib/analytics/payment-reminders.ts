import "server-only";
/** Compatibility facade for legacy analytics route imports. */
export {
  getReminderRule,
  reminderEmailConfigured,
  runAutomaticReminders,
  sendManualReminder,
  sendReminder,
  setReminderRule,
} from "@/plugins/payment-reminders/service";
export type { AutomaticReminderRun, PaymentReminderRule, ReminderResult } from "@/plugins/payment-reminders/service";
