import { z } from "zod";

/** Official Manus webhook payload (event_type + task_detail or progress_detail). */
const ManusTaskDetailSchema = z.object({
  task_id: z.string().min(1),
  task_title: z.string().optional(),
  task_url: z.string().optional(),
  message: z.string().optional(),
  attachments: z.array(z.object({ file_name: z.string(), url: z.string(), size_bytes: z.number() })).optional(),
  stop_reason: z.enum(["finish", "ask"]).optional(),
});

const ManusProgressDetailSchema = z.object({
  task_id: z.string().min(1),
  progress_type: z.string(),
  message: z.string(),
});

export const ManusWebhookPayloadSchema = z.object({
  event_id: z.string().optional(),
  event_type: z.enum(["task_created", "task_progress", "task_stopped"]),
  task_detail: ManusTaskDetailSchema.optional(),
  progress_detail: ManusProgressDetailSchema.optional(),
});

export type ManusWebhookPayload = z.infer<typeof ManusWebhookPayloadSchema>;
