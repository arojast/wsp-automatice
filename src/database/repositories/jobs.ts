import { db } from "../client";
import { jobs } from "../schema";

export async function createJob(data: {
    type: string;
    messageId: number;
    scheduledAt: Date;
}) {
    return db
        .insert(jobs)
        .values({
            type: data.type,
            messageId: data.messageId,
            scheduledAt: data.scheduledAt,
        })
        .returning()
        .get();
}