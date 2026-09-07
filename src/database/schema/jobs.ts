import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { messages } from "./messages";

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
        .notNull()
        .references(() => messages.id),

    status: text("status", {
        enum: jobStatuses,
    })
        .notNull()
        .default("PENDING"),

    scheduledAt: integer("scheduled_at", {
        mode: "timestamp",
    }),

    attempts: integer("attempts")
        .notNull()
        .default(0),

    createdAt: integer("created_at", {
        mode: "timestamp",
    })
        .notNull()
        .$defaultFn(() => new Date()),

    processedAt: integer("processed_at", {
        mode: "timestamp",
    }),

    error: text("error"),
}, (table) => ({
    typeMessageUnique: uniqueIndex("jobs_type_message_unique")
        .on(table.type, table.messageId),
}));