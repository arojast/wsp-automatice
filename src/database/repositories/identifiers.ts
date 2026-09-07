import { db } from '../client';
import { eq, and } from "drizzle-orm";
import { identifiers } from '../schema';

export async function findIdentifier(
    value: string,
    type: string,
) {
    return db
        .select()
        .from(identifiers)
        .where(
            and(
                eq(identifiers.value, value),
                eq(identifiers.type, type),
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