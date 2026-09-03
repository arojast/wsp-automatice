import {
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";

export const chats = sqliteTable("chats", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    whatsappChatId: text("whatsapp_chat_id").notNull(),

    name: text("name"),

    isGroup: integer("is_group", { mode: "boolean" })
        .notNull()
        .default(false),

    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),

    updatedAt: integer("updated_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
});