import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { datetime } from '../types';

export const batchStatuses = [
    "CREATING",
    "READY",
    "SENT",
    "ZIP_RECEIVED",
    "PROCESSING",
    "COMPLETED",
    "ERROR",
] as const;

export type BatchStatus = (typeof batchStatuses)[number];

export const batches = sqliteTable("batches", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    number: integer("number").notNull(),

    status: text("status", {
        enum: batchStatuses,
    })
        .notNull()
        .default("CREATING"),

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),

    sentAt: datetime("sent_at"),

    zipReceivedAt: datetime("zip_received_at"),

    completedAt: datetime("completed_at"),
    
});