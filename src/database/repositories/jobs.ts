import { db } from "../client.js";
import {
    configuration,
    documents,
    identifiers,
    jobs,
} from "../schema/index.js";
import { and, eq, isNull } from "drizzle-orm";

export async function createJob(data: {
    type: string;
    messageId?: number;
    documentId?: number;
    filePath?: string;
    scheduledAt: Date | null;
}) {
    return db
        .insert(jobs)
        .values({
            type: data.type,
            messageId: data.messageId,
            documentId: data.documentId,
            filePath: data.filePath,
            scheduledAt: data.scheduledAt,
        })
        .returning()
        .get();
}

export async function getLastScheduledAt(): Promise<Date> {
    const config = await db
        .select({
            value: configuration.value,
        })
        .from(configuration)
        .where(eq(configuration.name, "last_scheduled_at"))
        .get();

    if (!config || !config.value) {
        return new Date();
    }

    const date = new Date(config.value);

    if (Number.isNaN(date.getTime())) {
        return new Date();
    }

    return date;
}

export async function setLastScheduledAt(date: Date): Promise<void> {
    await db
        .update(configuration)
        .set({
            value: date.toISOString(),
            updatedAt: new Date(),
        })
        .where(eq(configuration.name, "last_scheduled_at"));
}

export async function scheduleJobSequentially(
    jobId: number,
): Promise<Date> {
    const lastScheduledAt = await getLastScheduledAt();

    const scheduledAt = new Date(
        lastScheduledAt.getTime() + 1_000,
    );

    await db
        .update(jobs)
        .set({
            scheduledAt,
        })
        .where(eq(jobs.id, jobId));

    await setLastScheduledAt(scheduledAt);

    return scheduledAt;
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
                eq(jobs.type, "SEND_DOCUMENT"),
                eq(identifiers.batchId, batchId),
                eq(jobs.status, "PENDING"),
                isNull(jobs.scheduledAt),
            ),
        )
        .all();

    for (const job of pendingJobs) {
        await scheduleJobSequentially(job.jobId);
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

export async function scheduleReactionJobs(): Promise<number> {
    const pendingJobs = await db
        .select({
            jobId: jobs.id,
        })
        .from(jobs)
        .where(
            and(
                eq(jobs.type, "REACT_MESSAGE"),
                eq(jobs.status, "PENDING"),
                isNull(jobs.scheduledAt),
            ),
        )
        .all();

    let scheduledAt = Date.now();

    for (const job of pendingJobs) {
        scheduledAt += Math.floor(Math.random() * (20 - 5 + 1) + 5) * 1000;

        await db
            .update(jobs)
            .set({
                scheduledAt: new Date(scheduledAt),
            })
            .where(eq(jobs.id, job.jobId));
    }

    return pendingJobs.length;
}