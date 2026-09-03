import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

    number: integer("number").notNull().unique(),

    status: text("status", {
        enum: batchStatuses,
    })
        .notNull()
        .default("CREATING"),

    createdAt: integer("created_at", {
        mode: "timestamp",
    })
        .notNull()
        .$defaultFn(() => new Date()),

    sentAt: integer("sent_at", {
        mode: "timestamp",
    }),

    zipReceivedAt: integer("zip_received_at", {
        mode: "timestamp",
    }),

    completedAt: integer("completed_at", {
        mode: "timestamp",
    }),
    
});