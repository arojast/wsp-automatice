import { and, eq, lte } from 'drizzle-orm';
import type { WAMessageKey } from '@whiskeysockets/baileys';

import { db } from '../database/client.js';
import { jobs, identifiers } from '../database/schema/index.js';
import { findMessageById, findMessageWithChatById } from '../database/repositories/messages.js';
import {
    findDocumentForSending,
    markDocumentAsError,
    markDocumentAsSent,
} from '../database/repositories/documents.js';
import {
    reactToMessage,
    sendWhatsAppDocument,
    sendWhatsAppMessage,
} from '../whatsapp/client.js';
import { readFile } from 'node:fs/promises';

const POLL_INTERVAL = 5_000;
const PROCESSING_TIMEOUT = 5 * 60_000;
const MIN_DOCUMENT_SEND_INTERVAL = 1_000;
const unmatchedDocumentsRecipient = process.env.UNMATCHED_DOCUMENTS_JID;
let processingJobs = false;
let lastDocumentSentAt = 0;

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
        if (job.type === 'REACT_MESSAGE') {
            const databaseMessage = await findMessageById(job.messageId);

            if (!databaseMessage) {
                throw new Error(`Database message ${job.messageId} not found`);
            }

            const messageKey = JSON.parse(
                databaseMessage.whatsappMessageId,
            ) as WAMessageKey;

            await reactToMessage(messageKey, '👍');
        } else if (job.type === 'SEND_MISSING_IDENTIFIER') {
            const result = await findMessageWithChatById(job.messageId);

            if (!result) {
                throw new Error(
                    `Database message ${job.messageId} not found`,
                );
            }

            const { message, chat } = result;

            const messageIdentifiers = await db
                .select()
                .from(identifiers)
                .where(eq(identifiers.messageId, message.id))
                .all();

            if (messageIdentifiers.length === 0) {
                throw new Error(
                    `No identifiers found for message ${job.messageId}`,
                );
            }

            for (const item of messageIdentifiers) {
                await sendWhatsAppMessage(
                    chat.whatsappChatId,
                    `❌ ${item.value}`,
                );
            }
            
        } else if (job.type === 'SEND_UNMATCHED_DOCUMENT') {
            if (!job.filePath) {
                throw new Error(
                    `SEND_UNMATCHED_DOCUMENT job ${job.id} has no filePath`,
                );
            }

            if (!unmatchedDocumentsRecipient) {
                throw new Error(
                    'UNMATCHED_DOCUMENTS_JID is not configured',
                );
            }

            const filename = job.filePath.split('/').pop();

            if (!filename) {
                throw new Error(
                    `Could not determine filename for job ${job.id}`,
                );
            }

            const elapsed = Date.now() - lastDocumentSentAt;

            if (elapsed < MIN_DOCUMENT_SEND_INTERVAL) {
                await wait(MIN_DOCUMENT_SEND_INTERVAL - elapsed);
            }

            await readFile(job.filePath);

            await sendWhatsAppDocument(
                unmatchedDocumentsRecipient,
                job.filePath,
                filename,
            );

            lastDocumentSentAt = Date.now();
        } else if (job.type === 'SEND_DOCUMENT') {
            if (!job.documentId) {
                throw new Error(`SEND_DOCUMENT job ${job.id} has no documentId`);
            }

            const document = await findDocumentForSending(job.documentId);

            if (!document) {
                throw new Error(`Document ${job.documentId} not found`);
            }

            const elapsed = Date.now() - lastDocumentSentAt;

            if (elapsed < MIN_DOCUMENT_SEND_INTERVAL) {
                await wait(MIN_DOCUMENT_SEND_INTERVAL - elapsed);
            }

            await readFile(document.filePath);
            await sendWhatsAppDocument(
                document.whatsappChatId,
                document.filePath,
                document.filename,
            );
            await markDocumentAsSent(document.id);
            lastDocumentSentAt = Date.now();
        } else {
            throw new Error(`Unsupported job type: ${job.type}`);
        }

        await db
            .update(jobs)
            .set({
                status: 'COMPLETED',
                processedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));

        console.log(
            job.type === 'SEND_DOCUMENT'
                ? 'Document job completed:'
                : 'Reaction job completed:',
            job.id,
        );
    } catch (error) {
        if (job.type === 'SEND_DOCUMENT' && job.documentId) {
            await markDocumentAsError(job.documentId);
        }

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
