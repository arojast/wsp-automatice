import { db } from "../client";
import { documents, identifiers, jobs } from "../schema";
import { and, eq, isNull } from "drizzle-orm";

export async function createJob(data: {
    type: string;
    messageId: number;
    documentId?: number;
    scheduledAt: Date | null;
}) {
    return db
        .insert(jobs)
        .values({
            type: data.type,
            messageId: data.messageId,
            documentId: data.documentId,
            scheduledAt: data.scheduledAt,
        })
        .returning()
        .get();
}

export async function scheduleDocumentJobsByBatch(
    batchId: number,
): Promise<number> {
    const pendingJobs = await db
        .select({
            jobId: jobs.id,
        })
        .from(jobs)
        .innerJoin(documents, eq(jobs.documentId, documents.id))
        .innerJoin(identifiers, eq(documents.identifierId, identifiers.id))
        .where(
            and(
                eq(jobs.type, 'SEND_DOCUMENT'),
                eq(identifiers.batchId, batchId),
                eq(jobs.status, 'PENDING'),
                isNull(jobs.scheduledAt),
            ),
        )
        .all();

    for (const [index, job] of pendingJobs.entries()) {
        await db
            .update(jobs)
            .set({
                scheduledAt: new Date(Date.now() + index * 1_000),
            })
            .where(eq(jobs.id, job.jobId));
    }

    return pendingJobs.length;
}

export async function findJobByTypeAndDocument(
    type: string,
    documentId: number,
) {
    return db
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.type, type),
                eq(jobs.documentId, documentId),
            ),
        )
        .get();
}

export async function findJobByTypeAndMessage(
    type: string,
    messageId: number,
) {
    return db
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.type, type),
                eq(jobs.messageId, messageId),
            ),
        )
        .get();
}