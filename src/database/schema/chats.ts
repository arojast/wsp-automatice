import {
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";
import { datetime } from '../types';

export const chats = sqliteTable("chats", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    whatsappChatId: text("whatsapp_chat_id").notNull().unique(),

    name: text("name"),

    isGroup: integer("is_group", { mode: "boolean" })
        .notNull()
        .default(false),

    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),

    updatedAt: datetime("updated_at")
        .notNull()
        .$defaultFn(() => new Date()),
});