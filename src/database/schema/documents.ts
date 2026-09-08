import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { identifiers } from "./identifiers";
import { datetime } from '../types';

export const documentStatuses = [
  "RECEIVED",
  "SENT",
  "ERROR",
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  identifierId: integer("identifier_id")
    .notNull()
    .references(() => identifiers.id),

  filename: text("filename").notNull(),

  filePath: text("file_path").notNull(),

  receivedAt: datetime("received_at"),

  sentAt: datetime("sent_at"),

  status: text("status", {
    enum: documentStatuses,
  })
    .notNull()
    .default("RECEIVED"),
});