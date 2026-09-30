import { db } from '../client.js';
import { desc, eq, and, asc, sql } from 'drizzle-orm';
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

export async function findLatestIdentifier(
    value: string,
    type: string,
) {
    return db
        .select({
            identifierId: identifiers.id,
            messageId: identifiers.messageId,
            chatId: identifiers.chatId,
            batchId: identifiers.batchId,
            value: identifiers.value,
            type: identifiers.type,
        })
        .from(identifiers)
        .innerJoin(
            messages,
            eq(identifiers.messageId, messages.id),
        )
        .where(
            and(
                eq(identifiers.value, value),
                eq(identifiers.type, type),
                eq(messages.isDeleted, false),
            ),
        )
        .orderBy(desc(identifiers.id))
        .limit(1)
        .get();
}

export async function moveIdentifierToBatch(
    identifierId: number,
    batchId: number,
) {
    return db
        .update(identifiers)
        .set({
            batchId,
        })
        .where(eq(identifiers.id, identifierId))
        .returning()
        .get();
}

export async function findIdentifiersByMessageId(
    messageId: number,
) {
    return db
        .select()
        .from(identifiers)
        .where(eq(identifiers.messageId, messageId))
        .all();
}

export async function moveIdentifiersByMessageToBatch(
    messageId: number,
    batchId: number,
) {
    return db
        .update(identifiers)
        .set({
            batchId,
        })
        .where(eq(identifiers.messageId, messageId))
        .returning()
        .all();
}