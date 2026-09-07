import { and, eq, lte } from 'drizzle-orm';
import type { WAMessageKey } from '@whiskeysockets/baileys';

import { db } from '../database/client';
import { jobs } from '../database/schema';
import { findMessageById } from '../database/repositories/messages';
import { reactToMessage } from '../whatsapp/client';

const POLL_INTERVAL = 5_000;
const PROCESSING_TIMEOUT = 5 * 60_000;
let processingJobs = false;

async function processJobs(): Promise<void> {
    if (processingJobs) {
        return;
    }

    processingJobs = true;

    try {
        const staleProcessingBefore = new Date(Date.now() - PROCESSING_TIMEOUT);

        await db
            .update(jobs)
            .set({
                status: 'PENDING',
                error: null,
            })
            .where(
                and(
                    eq(jobs.status, 'PROCESSING'),
                    lte(jobs.createdAt, staleProcessingBefore),
                ),
            );

        const pendingJobs = await db
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.status, 'PENDING'),
                    lte(jobs.scheduledAt, new Date()),
                ),
            )
            .all();

        for (const job of pendingJobs) {
            await processJob(job);
        }
    } finally {
        processingJobs = false;
    }
}

async function processJob(job: typeof jobs.$inferSelect): Promise<void> {
    const claimedJob = await db
        .update(jobs)
        .set({
            status: 'PROCESSING',
            attempts: job.attempts + 1,
        })
        .where(
            and(
                eq(jobs.id, job.id),
                eq(jobs.status, 'PENDING'),
            ),
        )
        .returning()
        .get();

    if (!claimedJob) {
        return;
    }

    try {
        if (job.type !== 'REACT_MESSAGE') {
            throw new Error(`Unsupported job type: ${job.type}`);
        }

        const databaseMessage = await findMessageById(job.messageId);

        if (!databaseMessage) {
            throw new Error(`Database message ${job.messageId} not found`);
        }

        const messageKey = JSON.parse(
            databaseMessage.whatsappMessageId,
        ) as WAMessageKey;

        await reactToMessage(messageKey, '👍');

        await db
            .update(jobs)
            .set({
                status: 'COMPLETED',
                processedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));

        console.log('Reaction job completed:', job.id);
    } catch (error) {
        await db
            .update(jobs)
            .set({
                status: 'ERROR',
                error: String(error),
            })
            .where(eq(jobs.id, job.id));

        console.error('Reaction job failed:', job.id, error);
    }
}

export function startQueueWorker(): void {
    console.log('Queue worker started');

    setInterval(() => {
        processJobs().catch((error) => {
            console.error('Queue worker error:', error);
        });
    }, POLL_INTERVAL);
}
