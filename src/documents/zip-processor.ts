import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import unzipper from 'unzipper';

import { findIdentifiersByBatchId } from '../database/repositories/identifiers';
import {
    createJob,
    findJobByTypeAndDocument,
} from '../database/repositories/jobs';
import {
    createDocument,
    findDocumentByIdentifierAndFilename,
} from '../database/repositories/documents';
import {
    downloadIncomingDocument,
    type IncomingWhatsAppMessage,
} from '../whatsapp/client';

function normalizeIdentifier(value: string): string {
    return value.trim().toUpperCase();
}

function birthDatePart(value: string): string | null {
    const normalized = normalizeIdentifier(value);

    return normalized.length >= 10
        ? normalized.slice(4, 10)
        : null;
}

export async function saveZipDocuments(
    message: IncomingWhatsAppMessage,
    batchId: number,
    scheduleJobs = true,
): Promise<{
    saved: string[];
    unmatched: string[];
    missingIdentifiers: Array<{
        chatName: string | null;
        identifier: string;
    }>;
}> {
    const document = await downloadIncomingDocument(message);

    if (!document || !document.filename.toLowerCase().endsWith('.zip')) {
        throw new Error('El archivo recibido debe ser un ZIP.');
    }

    const batchIdentifiers = await findIdentifiersByBatchId(batchId);
    const identifiersByValue = new Map(
        batchIdentifiers.map((item) => [normalizeIdentifier(item.identifier), item]),
    );
    const identifiersByPrefix = new Map<string, typeof batchIdentifiers[number]>();
    const ambiguousPrefixes = new Set<string>();
    const identifiersByBirthDate = new Map<
        string,
        typeof batchIdentifiers[number][]
    >();

    for (const item of batchIdentifiers) {
        const prefix = normalizeIdentifier(item.identifier).slice(0, 10);

        if (identifiersByPrefix.has(prefix)) {
            ambiguousPrefixes.add(prefix);
        } else {
            identifiersByPrefix.set(prefix, item);
        }

        const birthDate = birthDatePart(item.identifier);

        if (birthDate) {
            const candidates = identifiersByBirthDate.get(birthDate) ?? [];
            candidates.push(item);
            identifiersByBirthDate.set(birthDate, candidates);
        }
    }

    const outputDirectory = join('data', 'documents', `batch-${batchId}`);
    await mkdir(outputDirectory, { recursive: true });

    const saved: string[] = [];
    const unmatched: string[] = [];
    const matchedIdentifierIds = new Set<number>();
    let documentQueueOffset = 0;
    const archive = await unzipper.Open.buffer(document.data);
    const pdfEntries = archive.files.filter((entry) => {
        const filename = basename(entry.path);
        return entry.type === 'File' && /^csf_.+\.pdf$/i.test(filename);
    });

    for (const entry of pdfEntries) {
        const filename = basename(entry.path);
        const match = filename.match(/^csf_(.+)\.pdf$/i);
        const normalizedIdentifier = normalizeIdentifier(match?.[1] ?? '');
        const prefix = normalizedIdentifier.slice(0, 10);
        let identifier = identifiersByValue.get(normalizedIdentifier) ??
            (!ambiguousPrefixes.has(prefix)
                ? identifiersByPrefix.get(prefix)
                : undefined);

        if (!identifier) {
            const birthDate = birthDatePart(normalizedIdentifier);
            const zipCandidates = birthDate
                ? pdfEntries.filter((candidate) => {
                    const candidateName = basename(candidate.path);
                    const candidateMatch = candidateName.match(/^csf_(.+)\.pdf$/i);
                    return birthDatePart(candidateMatch?.[1] ?? '') === birthDate;
                })
                : [];
            const batchCandidates = birthDate
                ? identifiersByBirthDate.get(birthDate) ?? []
                : [];

            if (zipCandidates.length === 1 && batchCandidates.length === 1) {
                identifier = batchCandidates[0];
            }
        }

        if (!identifier || matchedIdentifierIds.has(identifier.identifierId)) {
            unmatched.push(filename);
            continue;
        }

        const existingDocument = await findDocumentByIdentifierAndFilename(
            identifier.identifierId,
            filename,
        );

        if (existingDocument) {
            if (existingDocument.status !== 'SENT') {
                await enqueueDocumentJob(
                    existingDocument.id,
                    identifier.messageId,
                    documentQueueOffset,
                    scheduleJobs,
                );
                documentQueueOffset += 1_000;
            }
            matchedIdentifierIds.add(identifier.identifierId);
            saved.push(filename);
            continue;
        }

        const filePath = join(outputDirectory, filename);
        await writeFile(filePath, await entry.buffer());
        const savedDocument = await createDocument({
            identifierId: identifier.identifierId,
            filename,
            filePath,
        });
        await enqueueDocumentJob(
            savedDocument.id,
            identifier.messageId,
            documentQueueOffset,
            scheduleJobs,
        );
        documentQueueOffset += 1_000;
        matchedIdentifierIds.add(identifier.identifierId);
        saved.push(filename);
    }

    const missingIdentifiers = batchIdentifiers
        .filter((item) => !matchedIdentifierIds.has(item.identifierId))
        .map((item) => ({
            chatName: item.chatName,
            identifier: item.identifier,
        }));

    return { saved, unmatched, missingIdentifiers };
}

async function enqueueDocumentJob(
    documentId: number,
    messageId: number,
    delay: number,
    scheduleJob: boolean,
): Promise<void> {
    const existingJob = await findJobByTypeAndDocument(
        'SEND_DOCUMENT',
        documentId,
    );

    if (!existingJob) {
        await createJob({
            type: 'SEND_DOCUMENT',
            messageId,
            documentId,
            scheduledAt: scheduleJob
                ? new Date(Date.now() + delay)
                : null,
        });
    }
}
