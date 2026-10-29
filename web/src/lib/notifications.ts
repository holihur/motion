// Placeholder for enterprise notification (email/企业微信). Webhook already emitted on comment.created via webhooks.Emit.
export type NotificationChannel = "webhook" | "email" | "wechat";

export interface NotificationPayload {
  channel: NotificationChannel;
  pageId: string;
  commentId: string;
  to: string[];
  body: string;
}

// Stub: integrates with /api/workspaces/{id}/integrations (webhook) and future email provider.
// Currently UI shows bell with audit polling; actual push via webhook delivery already done server-side.
export async function sendNotification(_payload: NotificationPayload): Promise<boolean> {
  // enterprise wechat/email provider hook point
  return true;
}
