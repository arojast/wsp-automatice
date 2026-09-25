import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { messages } from "./messages.js";
import { documents } from "./documents.js";
import { datetime } from "../types.js";

export const jobStatuses = [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "ERROR",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export const jobs = sqliteTable("jobs", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    type: text("type").notNull(),

    messageId: integer("message_id")
        .references(() => messages.id),

    documentId: integer("document_id")
        .references(() => documents.id),

    filePath: text("file_path"),

    scheduledAt: datetime("scheduled_at"),

    status: text("status", {
        enum: jobStatuses,
    })
        .notNull()
        .default("PENDING"),

    attempts: integer("attempts")
        .notNull()
        .default(0),

    error: text("error"),

    processedAt: datetime("processed_at"),

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),
});