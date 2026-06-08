export const LAUNCH_SETTINGS_ID = "main";

export const DEFAULT_LAUNCH_SETTINGS = {
  id: LAUNCH_SETTINGS_ID,
  isActive: false,
  liveAt: "2026-06-08T12:00",
  statusPill: "Private preview",
  eyebrow: "New website loading",
  headline: "Launching 8 June",
  headlineAccent: "at 12pm.",
  copy: "We are putting the final pieces in place. Team access is available below.",
  passwordLabel: "Password",
  showPasswordText: "Show",
  hidePasswordText: "Hide",
  submitButtonText: "Enter website",
  busyButtonText: "Checking...",
  emptyPasswordMessage: "Enter the launch access password.",
  configMissingMessage: "Launch access is not configured. Supabase environment variables are missing.",
  acceptedButUnsavedMessage: "Password accepted, but access could not be saved. Please try again.",
  enquiryPromptText: "Need to contact us before launch?",
  enquiryButtonText: "Send an enquiry",
  enquiryEyebrow: "Website enquiry",
  enquiryTitle: "Send us a message",
  closeButtonText: "Close",
  cancelButtonText: "Cancel",
  sendButtonText: "Send enquiry",
  sendingButtonText: "Sending...",
  enquirySuccessMessage: "Thanks. Your enquiry has been received and we will respond within 1-3 business days.",
};

const FIELD_MAP = {
  id: "id",
  is_active: "isActive",
  live_at: "liveAt",
  status_pill: "statusPill",
  eyebrow: "eyebrow",
  headline: "headline",
  headline_accent: "headlineAccent",
  copy: "copy",
  password_label: "passwordLabel",
  show_password_text: "showPasswordText",
  hide_password_text: "hidePasswordText",
  submit_button_text: "submitButtonText",
  busy_button_text: "busyButtonText",
  empty_password_message: "emptyPasswordMessage",
  config_missing_message: "configMissingMessage",
  accepted_but_unsaved_message: "acceptedButUnsavedMessage",
  enquiry_prompt_text: "enquiryPromptText",
  enquiry_button_text: "enquiryButtonText",
  enquiry_eyebrow: "enquiryEyebrow",
  enquiry_title: "enquiryTitle",
  close_button_text: "closeButtonText",
  cancel_button_text: "cancelButtonText",
  send_button_text: "sendButtonText",
  sending_button_text: "sendingButtonText",
  enquiry_success_message: "enquirySuccessMessage",
};

export function dbRowToLaunchSettings(row) {
  if (!row) return { ...DEFAULT_LAUNCH_SETTINGS };

  return Object.entries(FIELD_MAP).reduce(
    (settings, [dbField, appField]) => {
      if (row[dbField] !== undefined && row[dbField] !== null) {
        settings[appField] = row[dbField];
      }
      return settings;
    },
    { ...DEFAULT_LAUNCH_SETTINGS }
  );
}

export function launchSettingsToDbRow(settings) {
  const normalized = normalizeLaunchSettings(settings);
  return Object.entries(FIELD_MAP).reduce((row, [dbField, appField]) => {
    row[dbField] = normalized[appField];
    return row;
  }, {});
}

export function normalizeLaunchSettings(settings = {}) {
  const normalized = { ...DEFAULT_LAUNCH_SETTINGS };

  Object.keys(DEFAULT_LAUNCH_SETTINGS).forEach((field) => {
    if (field === "isActive") {
      normalized.isActive = Boolean(settings.isActive);
      return;
    }

    if (settings[field] !== undefined && settings[field] !== null) {
      normalized[field] = String(settings[field]).trim();
    }
  });

  normalized.id = LAUNCH_SETTINGS_ID;
  return normalized;
}

export async function getLaunchSettingsFromSupabase(supabase) {
  const { data, error } = await supabase
    .from("pcd_launch_settings")
    .select("*")
    .eq("id", LAUNCH_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return dbRowToLaunchSettings(data);
}
