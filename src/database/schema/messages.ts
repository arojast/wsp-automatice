import {
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";
import { chats } from "./chats";
import { datetime } from '../types';

export const messages = sqliteTable("messages", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    whatsappMessageId: text("whatsapp_message_id")
        .notNull()
        .unique(),

    chatId: integer("chat_id")
        .notNull()
        .references(() => chats.id),

    senderName: text("sender_name"),

    senderId: text("sender_id"),

    body: text("body").notNull(),

    messageDatetime: datetime("message_datetime").notNull(),

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),

    processingStatus: text("processing_status")
        .notNull()
        .default("pending"),

    isDeleted: integer("is_deleted", {
        mode: "boolean",
    })
        .notNull()
        .default(false),

    deletedAt: datetime("deleted_at"),
});