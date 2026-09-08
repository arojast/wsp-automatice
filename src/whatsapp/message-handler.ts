import { detectIdentifiers } from '../identifiers/detector';
import { whatsappGroups } from './groups';
import { findOrCreateChat } from '../database/repositories/chats';
import { findOrCreateMessage } from '../database/repositories/messages';
import {
    createIdentifiers,
    findIdentifiersByBatchId,
} from '../database/repositories/identifiers';
import { findOrCreateCreatingBatch, markCreatingBatchAsSent } from '../database/repositories/batches';
import {
    createJob,
    findJobByTypeAndMessage,
    scheduleDocumentJobsByBatch,
} from '../database/repositories/jobs';
import {
    sendWhatsAppMessage,
    type IncomingWhatsAppMessage,
} from './client';
import { saveZipDocuments } from '../documents/zip-processor';

const configuredAdminJid = process.env.ADMIN_WHATSAPP_JID;
let awaitingBatchId = false;
let awaitingZipBatchId = false;
let awaitingScheduleBatchId = false;
let zipBatchId: number | null = null;
let scheduleZipJobs = true;
let groupMessageProcessingEnabled = true;

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
                '-6 Consultar estado de lectura',
                '-7 Pausar lectura de mensajes de grupos',
                '-8 Reactivar lectura de mensajes de grupos',
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

    // Command -3: upload a ZIP and schedule its document jobs immediately.
    // Command -4: upload a ZIP and leave its document jobs without a date.
    if (command === '-3' || command === '-4') {
        awaitingZipBatchId = true;
        awaitingBatchId = false;
        awaitingScheduleBatchId = false;
        scheduleZipJobs = command === '-3';
        await sendWhatsAppMessage(replyTo, 'Ingrese el numero del batch');
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
            groupMessageProcessingEnabled
                ? 'La lectura y el procesamiento de mensajes esta ACTIVO.'
                : 'La lectura y el procesamiento de mensajes esta PAUSADO.',
        );
        return;
    }

    // Command -7: stop saving and processing incoming group messages.
    if (command === '-7') {
        groupMessageProcessingEnabled = false;
        await sendWhatsAppMessage(
            replyTo,
            'El procesamiento de mensajes de grupos ha sido detenido.',
        );
        return;
    }

    // Command -8: resume saving and processing incoming group messages.
    if (command === '-8') {
        await sendWhatsAppMessage(
            replyTo,
            'El procesamiento de mensajes de grupos ha sido reactivado.',
        );
        groupMessageProcessingEnabled = true;
        return;
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
            const result = await saveZipDocuments(message, zipBatchId, scheduleZipJobs);
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
                ].join('\n'),
            );
        } catch (error) {
            await sendWhatsAppMessage(replyTo, `No se pudo procesar el ZIP: ${String(error)}`);
        } finally {
            zipBatchId = null;
        }
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

        if (!groupMessageProcessingEnabled) {
            console.log('Group message processing is disabled');
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
                scheduledAt: new Date(Date.now() + randomReactionDelay()),
            });
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
}
