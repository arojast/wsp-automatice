import {
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";
import { chats } from "./chats";
import { messages } from "./messages";
import { batches } from "./batches";

export const identifiers = sqliteTable("identifiers", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    messageId: integer("message_id")
        .notNull()
        .references(() => messages.id),

    chatId: integer("chat_id")
        .notNull()
        .references(() => chats.id),

    batchId: integer("batch_id")
        .notNull()
        .references(() => batches.id),

    value: text("value").notNull(),

    type: text("type").notNull(),

    createdAt: integer("created_at", {
        mode: "timestamp",
    })
        .notNull()
        .$defaultFn(() => new Date()),
});