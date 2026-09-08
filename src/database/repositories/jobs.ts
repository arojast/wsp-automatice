import { db } from "../client";
import { jobs } from "../schema";
import { and, eq } from "drizzle-orm";

export async function createJob(data: {
    type: string;
    messageId: number;
    documentId?: number;
    scheduledAt: Date;
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