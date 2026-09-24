import { db } from "../client.js";
import { eq } from "drizzle-orm";
import { messages, identifiers, jobs } from "../schema/index.js";

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
    return db.transaction((tx) => {
        const message = tx
            .select()
            .from(messages)
            .where(eq(messages.whatsappMessageId, whatsappMessageId))
            .get();

        if (!message) {
            return null;
        }

        // Delete jobs related to this message
        tx.delete(jobs)
            .where(eq(jobs.messageId, message.id))
            .run();

        // Delete identifiers related to this message
        tx.delete(identifiers)
            .where(eq(identifiers.messageId, message.id))
            .run();

        // Keep the message, but mark it as deleted
        return tx
            .update(messages)
            .set({
                isDeleted: true,
                deletedAt: new Date(),
            })
            .where(eq(messages.id, message.id))
            .returning()
            .get();
    });
}

export async function findMessageById(id: number) {
    return db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .get();
}