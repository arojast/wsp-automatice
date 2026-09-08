import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { messages } from "./messages";
import { documents } from "./documents";
import { datetime } from '../types';

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

    documentId: integer("document_id")
        .references(() => documents.id),

    status: text("status", {
        enum: jobStatuses,
    })
        .notNull()
        .default("PENDING"),

    scheduledAt: datetime("scheduled_at"),

    attempts: integer("attempts")
        .notNull()
        .default(0),

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),

    processedAt: datetime("processed_at"),

    error: text("error"),
}, (table) => ({
    typeMessageUnique: uniqueIndex("jobs_type_message_unique")
        .on(table.type, table.messageId)
        .where(sql`type = 'REACT_MESSAGE'`),
    typeDocumentUnique: uniqueIndex("jobs_type_document_unique")
        .on(table.type, table.documentId),
}));