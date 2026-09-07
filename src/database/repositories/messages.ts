import { db } from "../client";
import { eq } from "drizzle-orm";
import { messages } from "../schema";

export async function findMessagesByWhatsappId(whatsappMessageId: string) {
    return db
        .select()
        .from(messages)
        .where(eq(messages.whatsappMessageId, whatsappMessageId))
        .get();
}

export async function createMessage(data: {
    whatsappMessageId: string;
    chatId: number;
    senderName: string | null;
    senderId: string;
    body: string;
    messageDatetime: Date;
}) {
    return db
        .insert(messages)
        .values(data)
        .returning()
        .get();
}

export async function updateMessage(whatsappMessageId: string, data: {
    senderName: string | null;
    senderId: string;
    body: string;
    messageDatetime: Date;
}) {
    return db
        .update(messages)
        .set(data)
        .where(eq(messages.whatsappMessageId, whatsappMessageId))
        .returning()
        .get();
}

export async function findOrCreateMessage(data: {
    whatsappMessageId: string;
    chatId: number;
    senderName: string | null;
    senderId: string;
    body: string;
    messageDatetime: Date;
}) {
    const existing = await findMessagesByWhatsappId(data.whatsappMessageId);

    if (existing) {
        return updateMessage(data.whatsappMessageId, data);
    }

    return createMessage(data);
}

export async function markMessageAsDeleted(whatsappMessageId: string) {
    return await db
        .update(messages)
        .set({
            isDeleted: true,
            deletedAt: new Date(),
        })
        .where(eq(messages.whatsappMessageId, whatsappMessageId));
}