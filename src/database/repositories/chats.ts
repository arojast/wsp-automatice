import { eq } from "drizzle-orm";
import { db } from "../client";
import { chats } from "../schema";

export async function findChatByWhatsappId(whatsappChatId: string) {
    return db
        .select()
        .from(chats)
        .where(eq(chats.whatsappChatId, whatsappChatId))
        .get();
}

export async function createChat(data: {
    whatsappChatId: string;
    name: string;
    isGroup: boolean;
}) {
    return db
        .insert(chats)
        .values(data)
        .returning()
        .get();
}

export async function findOrCreateChat(data: {
    whatsappChatId: string;
    name: string;
    isGroup: boolean;
}) {
    const existing = await findChatByWhatsappId(data.whatsappChatId);

    if (existing) {
        return existing;
    }

    return createChat(data);
}