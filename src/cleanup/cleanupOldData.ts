import {
    and,
    inArray,
    lt,
    notInArray,
    or,
} from "drizzle-orm";

import { db } from "../database/client.js";
import { batches } from "../database/schema/batches.js";
import { identifiers } from "../database/schema/identifiers.js";
import { documents } from "../database/schema/documents.js";
import { jobs } from "../database/schema/jobs.js";
import { messages } from "../database/schema/messages.js";

import { rm, rmdir, unlink } from "node:fs/promises";

const CLEANUP_AFTER_HOURS = 72;

export async function findOldBatches(): Promise<void> {
    const cutoff = new Date(
        Date.now() - CLEANUP_AFTER_HOURS * 60 * 60 * 1000,
    );

    // --------------------------------------------------
    // 1. Find old batches
    // --------------------------------------------------

    const oldBatches = await db
        .select({
            id: batches.id,
            number: batches.number,
            status: batches.status,
            createdAt: batches.createdAt,
        })
        .from(batches)
        .where(lt(batches.createdAt, cutoff));

    console.log(`Cleanup cutoff: ${cutoff.toISOString()}`);
    console.log(`Old batches found: ${oldBatches.length}`);

    for (const batch of oldBatches) {
        console.log({
            id: batch.id,
            number: batch.number,
            status: batch.status,
            createdAt: batch.createdAt,
        });
    }

    const batchIds = oldBatches.map(
        (batch) => batch.id,
    );

    if (batchIds.length === 0) {
        console.log("Nothing to clean.");
        return;
    }

    // --------------------------------------------------
    // 2. Find identifiers belonging to old batches
    // --------------------------------------------------

    const oldIdentifiers = await db
        .select({
            id: identifiers.id,
            batchId: identifiers.batchId,
            messageId: identifiers.messageId,
            chatId: identifiers.chatId,
            value: identifiers.value,
            type: identifiers.type,
        })
        .from(identifiers)
        .where(
            inArray(
                identifiers.batchId,
                batchIds,
            ),
        );

    console.log(
        `Old identifiers found: ${oldIdentifiers.length}`,
    );

    const identifierIds = oldIdentifiers.map(
        (identifier) => identifier.id,
    );

    // --------------------------------------------------
    // 3. Find documents belonging to old identifiers
    // --------------------------------------------------

    const oldDocuments =
        identifierIds.length > 0
            ? await db
                .select({
                    id: documents.id,
                    identifierId: documents.identifierId,
                    filename: documents.filename,
                    filePath: documents.filePath,
                    status: documents.status,
                })
                .from(documents)
                .where(
                    inArray(
                        documents.identifierId,
                        identifierIds,
                    ),
                )
            : [];

    console.log(
        `Old documents found: ${oldDocuments.length}`,
    );

    // --------------------------------------------------
    // 4. Delete physical document files
    // --------------------------------------------------

    const filesDeleted =
        await deleteDocumentFiles(oldDocuments);

    if (!filesDeleted) {
        console.error(
            "File cleanup failed. Database cleanup will not continue.",
        );

        return;
    }

    const directoriesDeleted =
        await deleteBatchDirectories(oldBatches);

    if (!directoriesDeleted) {
        console.error(
            "Batch directory cleanup failed. Database cleanup will not continue.",
        );
        return;
    }

    console.log(
        "All document files were deleted successfully.",
    );

    // --------------------------------------------------
    // 5. Find unique messages
    // --------------------------------------------------

    const messageIds = [
        ...new Set(
            oldIdentifiers.map(
                (identifier) => identifier.messageId,
            ),
        ),
    ];

    console.log(
        `Old message IDs found: ${messageIds.length}`,
    );

    console.log(messageIds);

    // --------------------------------------------------
    // 6. Find document IDs
    // --------------------------------------------------

    const documentIds = oldDocuments.map(
        (document) => document.id,
    );

    // --------------------------------------------------
    // 7. Find jobs related to old messages/documents
    // --------------------------------------------------

    const oldJobs =
        messageIds.length > 0 || documentIds.length > 0
            ? await db
                .select({
                    id: jobs.id,
                    type: jobs.type,
                    messageId: jobs.messageId,
                    documentId: jobs.documentId,
                    status: jobs.status,
                    scheduledAt: jobs.scheduledAt,
                })
                .from(jobs)
                .where(
                    or(
                        messageIds.length > 0
                            ? inArray(
                                jobs.messageId,
                                messageIds,
                            )
                            : undefined,

                        documentIds.length > 0
                            ? inArray(
                                jobs.documentId,
                                documentIds,
                            )
                            : undefined,
                    ),
                )
            : [];

    console.log(
        `Old jobs found: ${oldJobs.length}`,
    );

    // --------------------------------------------------
    // 8. Verify messages are not used by newer batches
    // --------------------------------------------------

    const remainingIdentifiers =
        messageIds.length > 0
            ? await db
                .select({
                    id: identifiers.id,
                    messageId: identifiers.messageId,
                    batchId: identifiers.batchId,
                    value: identifiers.value,
                })
                .from(identifiers)
                .where(
                    and(
                        inArray(
                            identifiers.messageId,
                            messageIds,
                        ),
                        notInArray(
                            identifiers.batchId,
                            batchIds,
                        ),
                    ),
                )
            : [];

    console.log(
        `Identifiers from newer batches referencing old messages: ${remainingIdentifiers.length}`,
    );

    for (const identifier of remainingIdentifiers) {
        console.log(identifier);
    }

    // --------------------------------------------------
    // Safety check
    // --------------------------------------------------

    if (remainingIdentifiers.length > 0) {
        console.error(
            "Some messages are still referenced by newer batches.",
        );

        console.error(
            "Database cleanup will not continue.",
        );

        return;
    }

    // --------------------------------------------------
    // 9. IDs of jobs to delete
    // --------------------------------------------------

    const jobIds = oldJobs.map(
        (job) => job.id,
    );

    // --------------------------------------------------
    // 10. Delete database records
    // --------------------------------------------------

    await deleteOldBatchData({
        batchIds,
        identifierIds,
        documentIds,
        jobIds,
        messageIds,
    });

    console.log(
        "Database cleanup completed successfully.",
    );
}


// ======================================================
// Delete physical files
// ======================================================

async function deleteDocumentFiles(
    documentsToDelete: Array<{
        id: number;
        identifierId: number;
        filename: string;
        filePath: string;
        status: "RECEIVED" | "SENT" | "ERROR";
    }>,
): Promise<boolean> {
    for (const document of documentsToDelete) {
        try {
            await unlink(document.filePath);

            console.log(
                `Deleted file: ${document.filePath}`,
            );
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                console.log(
                    `File already missing: ${document.filePath}`,
                );

                continue;
            }

            console.error(
                `Failed to delete file: ${document.filePath}`,
                error,
            );

            return false;
        }
    }

    return true;
}


// ======================================================
// Delete database records
// ======================================================

function deleteOldBatchData({
    batchIds,
    identifierIds,
    documentIds,
    jobIds,
    messageIds,
}: {
    batchIds: number[];
    identifierIds: number[];
    documentIds: number[];
    jobIds: number[];
    messageIds: number[];
}): void {
    db.transaction((tx) => {
        if (jobIds.length > 0) {
            const result = tx
                .delete(jobs)
                .where(inArray(jobs.id, jobIds))
                .run();

            console.log(
                `Deleted jobs: ${result.changes}`,
            );
        }

        if (documentIds.length > 0) {
            const result = tx
                .delete(documents)
                .where(inArray(documents.id, documentIds))
                .run();

            console.log(
                `Deleted documents: ${result.changes}`,
            );
        }

        if (identifierIds.length > 0) {
            const result = tx
                .delete(identifiers)
                .where(inArray(identifiers.id, identifierIds))
                .run();

            console.log(
                `Deleted identifiers: ${result.changes}`,
            );
        }

        if (messageIds.length > 0) {
            const result = tx
                .delete(messages)
                .where(inArray(messages.id, messageIds))
                .run();

            console.log(
                `Deleted messages: ${result.changes}`,
            );
        }

        const result = tx
            .delete(batches)
            .where(inArray(batches.id, batchIds))
            .run();

        console.log(
            `Deleted batches: ${result.changes}`,
        );
    });
}


async function deleteBatchDirectories(
    batchesToDelete: Array<{
        id: number;
    }>,
): Promise<boolean> {
    for (const batch of batchesToDelete) {
        const directories = [
            `data/documents/batch-${batch.id}`,
            `data/unmatched/batch-${batch.id}`,
        ];

        for (const directoryPath of directories) {
            try {
                await rm(directoryPath, {
                    recursive: true,
                    force: true,
                });

                console.log(
                    `Deleted batch directory: ${directoryPath}`,
                );
            } catch (error) {
                console.error(
                    `Failed to delete batch directory: ${directoryPath}`,
                    error,
                );

                return false;
            }
        }
    }

    return true;
}