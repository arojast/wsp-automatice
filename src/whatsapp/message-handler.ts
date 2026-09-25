import { detectIdentifiers } from '../identifiers/detector.js';
import { whatsappGroups } from './groups.js';
import { findOrCreateChat } from '../database/repositories/chats.js';
import { findOrCreateMessage } from '../database/repositories/messages.js';
import {
    createIdentifiers,
    findIdentifiersByBatchId,
} from '../database/repositories/identifiers.js';
import { 
    findOrCreateCreatingBatch, 
    markCreatingBatchAsSent, 
    findLastCreatingBatch, 
    countIdentifiersByBatch 
} from '../database/repositories/batches.js';
import {
    createJob,
    findJobByTypeAndMessage,
    scheduleDocumentJobsByBatch,
    scheduleJobSequentially,
    scheduleReactionJobs,
} from '../database/repositories/jobs.js';
import {
    sendWhatsAppMessage,
    type IncomingWhatsAppMessage,
} from './client.js';
import { saveZipDocuments } from '../documents/zip-processor.js';

const configuredAdminJid = process.env.ADMIN_WHATSAPP_JID;
let reactionSchedulingEnabled = true;

let awaitingBatchId = false;
let awaitingZipBatchId = false;
let awaitingScheduleBatchId = false;
let awaitingZipAction = false;

let zipBatchId: number | null = null;
let scheduleZipJobs = true;

let pendingZipResult: {
    missingIdentifiers: Array<{
        messageId: number;
        chatName: string | null;
        identifier: string;
    }>;
    unmatched: string[];
    batchId: number;
} | null = null;

if (!configuredAdminJid) {
    throw new Error('ADMIN_WHATSAPP_JID is not configured');
}

const ADMIN_JID: string = configuredAdminJid;

function randomReactionDelay(): number {
    const minimum = 45_000;
    const maximum = 90_000;

    return Math.floor(
        minimum + Math.random() * (maximum - minimum + 1),
    );
}

async function handleAdminMessage(message: IncomingWhatsAppMessage): Promise<void> {
    const command = message.body.trim();
    const replyTo = message.key.remoteJid ?? ADMIN_JID;

    // Command -0: show the administrator command menu.
    if (command === '-0') {
        await sendWhatsAppMessage(
            replyTo,
            [
                'Menu de comandos:',
                '-0 Mostrar este menu',
                '-1 Marcar el batch actual como SENT',
                '-2 Consultar identificadores de un batch',
                '-3 Cargar ZIP y programar envio de PDFs',
                '-4 Cargar ZIP sin programar envio',
                '-5 Programar envio de PDFs cargados',
                '-6 Consultar estado de reacciòn de mensajes',
                '-7 Pausar reacciòn de mensajes de grupos',
                '-8 Reactivar reacciòn de mensajes de grupos',
                '-9 Mostrat el batch actual en estado CREATING y sus identificadores',
            ].join('\n'),
        );
        return;
    }

    // Command -1: mark the current creating batch as sent and return its identifiers.
    if (command === '-1') {
        const sentBatch = await markCreatingBatchAsSent();

        if (!sentBatch) {
            await sendWhatsAppMessage(replyTo, 'No hay un batch activo en estado CREATING.');
            return;
        }

        await sendWhatsAppMessage(
            replyTo,
            [
                'Batch enviado:',
                `ID: ${sentBatch.id}`,
                `Numero: ${sentBatch.number}`,
                `Estado: ${sentBatch.status}`,
                `Sent at: ${sentBatch.sentAt?.toISOString() ?? 'N/A'}`,
            ].join('\n'),
        );

        const batchIdentifiers = await findIdentifiersByBatchId(sentBatch.id);
        await sendWhatsAppMessage(
            replyTo,
            batchIdentifiers.length > 0
                ? batchIdentifiers.map(({ identifier }) => identifier).join('\n')
                : 'No hay identificadores en este batch.',
        );
        return;
    }

    // Command -2: request a batch ID and return its identifiers grouped by chat.
    if (command === '-2') {
        awaitingBatchId = true;
        await sendWhatsAppMessage(replyTo, 'Ingrese el id del batch a consultar');
        return;
    }

    if (awaitingZipAction) {
        if (!['0', '1', '2', '3'].includes(command)) {
            await sendWhatsAppMessage(
                replyTo,
                [
                    'Opcion invalida.',
                    '',
                    '0 = No realizar ninguna accion',
                    '1 = Enviar documentos no asociados y notificar identificadores sin documento',
                    '2 = Enviar documentos no asociados',
                    '3 = Notificar identificadores sin documento',
                ].join('\n'),
            );

            return;
        }

        awaitingZipAction = false;

        if (!pendingZipResult) {
            await sendWhatsAppMessage(
                replyTo,
                'No hay resultados pendientes del ZIP.',
            );

            return;
        }

        const result = pendingZipResult;
        pendingZipResult = null;

        switch (command) {
            case '0':
                await sendWhatsAppMessage(
                    replyTo,
                    'No se realizara ninguna accion.',
                );
                return;

            case '1':
                // Send unmatched documents.
                // Then schedule missing identifier notifications.
                await sendUnmatchedDocuments(result);

                await scheduleMissingIdentifierNotifications(
                    result.missingIdentifiers,
                );

                await sendWhatsAppMessage(
                    replyTo,
                    'Documentos no asociados y notificaciones de identificadores sin documento programados.',
                );

                return;

            case '2':
                await sendUnmatchedDocuments(result);

                await sendWhatsAppMessage(
                    replyTo,
                    'Documentos no asociados programados para envio.',
                );

                return;

            case '3':
                await scheduleMissingIdentifierNotifications(
                    result.missingIdentifiers,
                );

                await sendWhatsAppMessage(
                    replyTo,
                    'Notificaciones de identificadores sin documento programadas.',
                );

                return;
        }
    }

    // Command -3: upload a ZIP and schedule its document jobs immediately.
    // Command -4: upload a ZIP and leave its document jobs without a date.
    if (command === '-3' || command === '-4') {
        
        awaitingZipBatchId = true;
        awaitingBatchId = false;
        awaitingScheduleBatchId = false;
        awaitingZipAction = false;

        scheduleZipJobs = command === '-3';

        await sendWhatsAppMessage(
            replyTo,
            'Ingrese el numero del batch',
        );

        return;
    }

    // Command -5: assign dates to previously loaded document jobs.
    if (command === '-5') {
        awaitingScheduleBatchId = true;
        awaitingBatchId = false;
        awaitingZipBatchId = false;
        await sendWhatsAppMessage(replyTo, 'Ingrese el numero del batch');
        return;
    }

    // Command -6: report whether incoming group messages are being processed.
    if (command === '-6') {
        await sendWhatsAppMessage(
            replyTo,
            reactionSchedulingEnabled
                ? 'La lectura y reacciòn de mensajes esta ACTIVO.'
                : 'La lectura y reacciòn de mensajes esta PAUSADO.',
        );
        return;
    }

    // Command -7: stop saving and processing incoming group messages.
    if (command === '-7') {
        reactionSchedulingEnabled = false;
        await sendWhatsAppMessage(
            replyTo,
            'La reacciòn de mensajes de grupos ha sido detenido.',
        );
        return;
    }

    // Command -8: resume saving and processing incoming group messages.
    if (command === '-8') {
        reactionSchedulingEnabled = true;
        const scheduledJobs = await scheduleReactionJobs();
        await sendWhatsAppMessage(
            replyTo,
            [
                'La reacciòn de mensajes de grupos ha sido reactivado.',
                `Reacciones programadas: ${scheduledJobs}`,
            ].join('\n'),
        );
        
        return;
    }

    if (command === '-9') {
        const batch = await findLastCreatingBatch();

        if (!batch) {
            await sendWhatsAppMessage(replyTo, 'No hay un batch activo en estado CREATING.');
            return;
        }

        const identifierCount = await countIdentifiersByBatch(batch.id);

        await sendWhatsAppMessage(
            replyTo,
            [
                'Batch Actual:',
                `ID: ${batch.id}`,
                `Numero: ${batch.number}`,
                `Estado: ${batch.status}`,
                `Creado: ${batch.createdAt}`,
                `Identifiers: ${identifierCount}`,
            ].join('\n'),
        );
        return
    }


    if (awaitingBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(replyTo, 'El id del batch debe ser un numero entero.');
            return;
        }

        awaitingBatchId = false;
        const batchIdentifiers = await findIdentifiersByBatchId(Number(command));

        if (batchIdentifiers.length === 0) {
            await sendWhatsAppMessage(replyTo, `No hay identificadores para el batch ${command}.`);
            return;
        }

        const groupedIdentifiers = new Map<string, string[]>();

        for (const item of batchIdentifiers) {
            const groupName = item.chatName ?? 'Sin nombre';
            const groupIdentifiers = groupedIdentifiers.get(groupName) ?? [];
            groupIdentifiers.push(item.identifier);
            groupedIdentifiers.set(groupName, groupIdentifiers);
        }

        const response = [...groupedIdentifiers.entries()]
            .map(([groupName, identifiers]) => [groupName, ...identifiers].join('\n'))
            .join('\n\n');

        await sendWhatsAppMessage(replyTo, response);
        return;
    }

    if (awaitingZipBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(replyTo, 'El numero del batch debe ser un entero.');
            return;
        }

        zipBatchId = Number(command);
        awaitingZipBatchId = false;
        await sendWhatsAppMessage(replyTo, 'Envie el archivo ZIP con los PDFs.');
        return;
    }

    if (awaitingScheduleBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(replyTo, 'El numero del batch debe ser un entero.');
            return;
        }

        awaitingScheduleBatchId = false;
        const scheduledJobs = await scheduleDocumentJobsByBatch(Number(command));
        await sendWhatsAppMessage(
            replyTo,
            scheduledJobs > 0
                ? `${scheduledJobs} archivo(s) programado(s) para envio.`
                : `No hay archivos pendientes sin fecha para el batch ${command}.`,
        );
        return;
    }

    if (zipBatchId !== null && !command) {
        try {
            const result = await saveZipDocuments(
                message,
                zipBatchId,
                scheduleZipJobs,
            );

            pendingZipResult = {
                missingIdentifiers: result.missingIdentifiers,
                unmatched: result.unmatched,
                batchId: zipBatchId,
            };

            await sendWhatsAppMessage(
                replyTo,
                [
                    `PDFs guardados: ${result.saved.length}`,
                    result.saved.join('\n') || 'Ninguno',
                    '',
                    `PDFs no asociados: ${result.unmatched.length}`,
                    result.unmatched.join('\n') || 'Ninguno',
                    '',
                    `Identificadores sin documento: ${result.missingIdentifiers.length}`,
                    result.missingIdentifiers.length > 0
                        ? formatMissingIdentifiers(result.missingIdentifiers)
                        : 'Ninguno',
                    '',
                ].join('\n'),
            );

            await sendWhatsAppMessage(
                replyTo,
                [
                    '¿Qué deseas hacer?',
                    '0 = No realizar ninguna accion',
                    '1 = Enviar documentos no asociados y notificar identificadores sin documento',
                    '2 = Enviar documentos no asociados',
                    '3 = Notificar identificadores sin documento',
                ].join('\n'),
            );

            awaitingZipAction = true;

        } catch (error) {
            await sendWhatsAppMessage(replyTo, `No se pudo procesar el ZIP: ${String(error)}`);
        } finally {
            zipBatchId = null;
        }
    }
}

async function sendUnmatchedDocuments(
    result: {
        unmatched: string[];
        batchId: number;
    },
): Promise<void> {
    const unmatchedDirectory = `./data/unmatched/batch-${result.batchId}`;

    for (const filename of result.unmatched) {
        const filePath = `${unmatchedDirectory}/${filename}`;

        const job = await createJob({
            type: 'SEND_UNMATCHED_DOCUMENT',
            filePath,
            scheduledAt: null,
        });

        await scheduleJobSequentially(job.id);
    }
}

async function scheduleMissingIdentifierNotifications(
    missingIdentifiers: Array<{
        messageId: number;
        chatName: string | null;
        identifier: string;
    }>,
): Promise<void> {
    for (const item of missingIdentifiers) {
        const existingJob = await findJobByTypeAndMessage(
            'SEND_MISSING_IDENTIFIER',
            item.messageId,
        );

        if (existingJob) {
            continue;
        }

        const job = await createJob({
            type: 'SEND_MISSING_IDENTIFIER',
            messageId: item.messageId,
            scheduledAt: null,
        });

        await scheduleJobSequentially(job.id);
    }
}

function formatMissingIdentifiers(
    missingIdentifiers: Array<{
        chatName: string | null;
        identifier: string;
    }>,
): string {
    const groupedIdentifiers = new Map<string, string[]>();

    for (const item of missingIdentifiers) {
        const groupName = item.chatName ?? 'Sin nombre';
        const identifiers = groupedIdentifiers.get(groupName) ?? [];
        identifiers.push(item.identifier);
        groupedIdentifiers.set(groupName, identifiers);
    }

    return [...groupedIdentifiers.entries()]
        .map(([groupName, identifiers]) => [groupName, ...identifiers].join('\n'))
        .join('\n\n');
}

export async function handleIncomingMessage(message: IncomingWhatsAppMessage): Promise<void> {
    try {
        const chatId = message.from;

        if (!chatId.endsWith('@g.us')) {
            console.log(chatId,'chatID');
            if (chatId === ADMIN_JID) {
                await handleAdminMessage(message);
            } else {
                console.log('Ignoring private chat');
            }
            return;
        }

        // Ignore messages sent by the bot itself and messages from groups if group message processing is disabled.
        if (message.key.fromMe) {
            console.log('Ignoring message sent by myself');
            return;
        }

        const groupName = whatsappGroups[chatId] ?? chatId;
        const identifiers = detectIdentifiers(message.body);

        if (identifiers.length === 0) {
            return;
        }

        const chat = await findOrCreateChat({
            whatsappChatId: chatId,
            name: groupName,
            isGroup: true,
        });
        const messageDatetime = new Date(message.timestamp * 1000);
        const whatsappMessageId = JSON.stringify(message.key);
        const savedMessage = await findOrCreateMessage({
            whatsappMessageId,
            chatId: chat.id,
            senderName: message.senderName,
            senderId: message.author ?? '',
            body: message.body,
            messageDatetime,
        });

        const batch = await findOrCreateCreatingBatch();
        await createIdentifiers(
            identifiers.map((identifier) => ({
                messageId: savedMessage.id,
                chatId: chat.id,
                value: identifier.value,
                type: identifier.type,
                batchId: batch.id,
            })),
        );

        const existingReactionJob = await findJobByTypeAndMessage(
            'REACT_MESSAGE',
            savedMessage.id,
        );

        if (!existingReactionJob) {
            await createJob({
                type: 'REACT_MESSAGE',
                messageId: savedMessage.id,
                //validate that the scheduledAt is set only if reactionSchedulingEnabled is true, otherwise it should be null
                scheduledAt: reactionSchedulingEnabled
                    ? new Date(Date.now() + randomReactionDelay()) : null,
            });
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
}
