import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { datetime } from "../types.js";

export const configuration = sqliteTable("configuration", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    value: text("value").notNull(),
    createdAt: datetime("created_at")
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: datetime("updated_at")
        .notNull()
        .$defaultFn(() => new Date()),
});