const DEFAULT_ADMIN_EMAIL = "sales@perthcabinetdoors.com.au";

export function getAllowedAdminEmailClient() {
  return (
    process.env.NEXT_PUBLIC_ADMIN_LOGIN_EMAIL || DEFAULT_ADMIN_EMAIL
  ).toLowerCase();
}

export function getAllowedAdminEmailServer() {
  return (
    process.env.ADMIN_LOGIN_EMAIL ||
    process.env.NEXT_PUBLIC_ADMIN_LOGIN_EMAIL ||
    DEFAULT_ADMIN_EMAIL
  ).toLowerCase();
}
