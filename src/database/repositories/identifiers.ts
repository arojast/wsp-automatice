import { db } from '../client.js';
import { eq, and, asc } from "drizzle-orm";
import { batches, chats, identifiers, messages } from '../schema/index.js';

export async function findIdentifier(
    value: string,
    type: string,
    chatId: number,
    batchId: number,
) {
    return db
        .select()
        .from(identifiers)
        .where(
            and(
                eq(identifiers.value, value),
                eq(identifiers.type, type),
                eq(identifiers.chatId, chatId),
                eq(identifiers.batchId, batchId),
            ),
        )
        .get();
}

export async function createIdentifiers(data: {
        messageId: number;
        chatId: number;
        value: string;
        type: string;
        batchId: number;
}[]) {
    const savedIdentifiers = [];

    for (const identifier of data) {
        // Check if the identifier already exists
        const existing = await findIdentifier(
            identifier.value,
            identifier.type,
            identifier.chatId,
            identifier.batchId,
        );

        if (existing) {
            continue;
        }

        const saved = await db
            .insert(identifiers)
            .values([identifier])
            .returning()
            .get();

        savedIdentifiers.push(saved);
    }

    return savedIdentifiers;
}

export async function findIdentifiersByBatchId(batchId: number) {
    return db
        .select({
            identifierId: identifiers.id,
            messageId: identifiers.messageId,
            chatId: identifiers.chatId,
            chatName: chats.name,
            whatsappChatId: chats.whatsappChatId,
            identifier: identifiers.value,
        })
        .from(identifiers)
        .innerJoin(chats, eq(identifiers.chatId, chats.id))
        .innerJoin(messages, eq(identifiers.messageId, messages.id))
        .where(
            and(
                eq(identifiers.batchId, batchId),
                eq(messages.isDeleted, false),
            ),
        )
        .orderBy(asc(chats.name))
        .all();
}

export async function findIdentifierById(identifierId: number) {
    return db
        .select()
        .from(identifiers)
        .where(eq(identifiers.id, identifierId))
        .get();
}