import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { chats, documents, identifiers } from '../schema';

export async function createDocument(data: {
    identifierId: number;
    filename: string;
    filePath: string;
}) {
    return db
        .insert(documents)
        .values({
            ...data,
            receivedAt: new Date(),
            status: 'RECEIVED',
        })
        .returning()
        .get();
}

export async function findDocumentByIdentifierAndFilename(
    identifierId: number,
    filename: string,
) {
    return db
        .select()
        .from(documents)
        .where(
            and(
                eq(documents.identifierId, identifierId),
                eq(documents.filename, filename),
            ),
        )
        .get();
}

export async function findDocumentForSending(id: number) {
    return db
        .select({
            id: documents.id,
            filename: documents.filename,
            filePath: documents.filePath,
            whatsappChatId: chats.whatsappChatId,
        })
        .from(documents)
        .innerJoin(identifiers, eq(documents.identifierId, identifiers.id))
        .innerJoin(chats, eq(identifiers.chatId, chats.id))
        .where(eq(documents.id, id))
        .get();
}

export async function markDocumentAsSent(id: number) {
    return db
        .update(documents)
        .set({
            status: 'SENT',
            sentAt: new Date(),
        })
        .where(eq(documents.id, id))
        .returning()
        .get();
}

export async function markDocumentAsError(id: number) {
    return db
        .update(documents)
        .set({ status: 'ERROR' })
        .where(eq(documents.id, id));
}
