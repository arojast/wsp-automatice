import { db } from '../client';
import { desc, eq } from 'drizzle-orm';
import { batches } from '../schema';

export async function findLastCreatingBatch() {
    return db
        .select()
        .from(batches)
        .where(eq(batches.status, 'CREATING'))
        .orderBy(desc(batches.id))
        .limit(1)
        .get();
}

export async function createBatch() {
    const lastBatch = await db
        .select()
        .from(batches)
        .orderBy(desc(batches.number))
        .limit(1)
        .get();

    const nextNumber = lastBatch
        ? lastBatch.number + 1
        : 1;

    return db
        .insert(batches)
        .values({
            number: nextNumber,
            status: 'CREATING',
        })
        .returning()
        .get();
}

export async function findOrCreateCreatingBatch() {
    const existingBatch = await findLastCreatingBatch();

    if (existingBatch) {
        return existingBatch;
    }

    return createBatch();
}