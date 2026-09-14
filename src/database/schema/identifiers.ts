import {
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";
import { chats } from "./chats.js";
import { messages } from "./messages.js";
import { batches } from "./batches.js";
import { datetime } from '../types.js';

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

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),
});