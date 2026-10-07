import { detectIdentifiers } from '../identifiers/detector.js';
import { whatsappGroups } from './groups.js';
import { findOrCreateChat } from '../database/repositories/chats.js';
import { findOrCreateMessage } from '../database/repositories/messages.js';
import {
    createIdentifiers,
    findIdentifiersByBatchId,
    findLatestIdentifier,
    moveIdentifierToBatch,
    findIdentifiersByMessageId,
    moveIdentifiersByMessageToBatch,
} from '../database/repositories/identifiers.js';
import {
    findOrCreateCreatingBatch,
    markCreatingBatchAsSent,
    findLastCreatingBatch,
    findBatchById,
    countIdentifiersByBatch,
    createBatch,
} from '../database/repositories/batches.js';
import {
    createJob,
    findJobByTypeAndMessage,
    findJobByTypeAndIdentifier,
    scheduleDocumentJobsByBatch,
    scheduleJobSequentially,
    scheduleReactionJobs,
} from '../database/repositories/jobs.js';
import {
    getReactionActive,
    setReactionActive,
} from '../database/repositories/configuration.js';
import {
    sendWhatsAppMessage,
    type IncomingWhatsAppMessage,
} from './client.js';
import { saveZipDocuments } from '../documents/zip-processor.js';
import {
    countDocumentsSentTodayByChat,
} from '../database/repositories/documents.js';

const configuredAdminJid = process.env.ADMIN_WHATSAPP_JID;

let awaitingBatchId = false;
let awaitingZipBatchId = false;
let awaitingScheduleBatchId = false;
let awaitingZipAction = false;

let zipBatchId: number | null = null;
let scheduleZipJobs = true;

let pendingZipResult: {
    missingIdentifiers: Array<{
        identifierId: number;
        messageId: number;
        chatName: string | null;
        identifier: string;
    }>;
    unmatched: string[];
    batchId: number;
} | null = null;

let awaitingMoveIdentifierOption = false;
let awaitingMoveIdentifierBatchId = false;
let awaitingMoveIdentifier = false;

let moveIdentifierOption: 'ACTIVE' | 'BATCH' | 'MESSAGE' | null = null;
let moveIdentifierTargetBatchId: number | null = null;

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

/**
 * Reset all temporary administrator workflow state.
 *
 * This allows a new command such as -0, -2, -3, -5 or -10
 * to cancel any previous unfinished administrator workflow.
 */
function resetAdminWorkflow(): void {
    awaitingBatchId = false;
    awaitingZipBatchId = false;
    awaitingScheduleBatchId = false;
    awaitingZipAction = false;

    awaitingMoveIdentifierOption = false;
    awaitingMoveIdentifierBatchId = false;
    awaitingMoveIdentifier = false;

    zipBatchId = null;
    scheduleZipJobs = true;
    pendingZipResult = null;

    moveIdentifierOption = null;
    moveIdentifierTargetBatchId = null;
}

async function handleAdminMessage(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    const command = message.body.trim();
    const replyTo = message.key.remoteJid ?? ADMIN_JID;

    /*
     * Any new administrator command cancels the previous workflow.
     *
     * Examples:
     * - waiting for a batch ID
     * - waiting for a ZIP
     * - waiting for an identifier
     * - waiting for a -10 option
     *
     * Normal workflow responses such as "1", "2", "3" do not start
     * with "-", so they are not affected.
     */
    const isCommand = command.startsWith('-');

    if (isCommand) {
        resetAdminWorkflow();
    }

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
                '-10 Cambiar identificador a otro batch',
                '-11 Conteo final de archivos enviados del dia',
            ].join('\n'),
        );

        return;
    }

    // Command -1: mark the current creating batch as sent and return its identifiers.
    if (command === '-1') {
        const sentBatch = await markCreatingBatchAsSent();

        if (!sentBatch) {
            await sendWhatsAppMessage(
                replyTo,
                'No hay un batch activo en estado CREATING.',
            );

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

        const batchIdentifiers =
            await findIdentifiersByBatchId(sentBatch.id);

        await sendWhatsAppMessage(
            replyTo,
            batchIdentifiers.length > 0
                ? batchIdentifiers
                    .map(({ identifier }) => identifier)
                    .join('\n')
                : 'No hay identificadores en este batch.',
        );

        return;
    }

    // Command -2: request a batch ID and return its identifiers grouped by chat.
    if (command === '-2') {
        awaitingBatchId = true;

        await sendWhatsAppMessage(
            replyTo,
            'Ingrese el id del batch a consultar',
        );

        return;
    }

    // Handle the action selected after processing a ZIP.
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

        await sendWhatsAppMessage(
            replyTo,
            'Ingrese el numero del batch',
        );

        return;
    }

    // Command -6: report whether incoming group messages are being processed.
    if (command === '-6') {
        const reactionActive = await getReactionActive();

        await sendWhatsAppMessage(
            replyTo,
            reactionActive
                ? 'La reacciòn de mensajes esta ACTIVO.'
                : 'La reacciòn de mensajes esta PAUSADO.',
        );

        return;
    }

    // Command -7: pause reaction scheduling.
    if (command === '-7') {
        await setReactionActive(false);

        await sendWhatsAppMessage(
            replyTo,
            'La reacciòn de mensajes de grupos ha sido detenido.',
        );

        return;
    }

    // Command -8: resume reaction scheduling.
    if (command === '-8') {
        await setReactionActive(true);

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

    // Command -9: show the current CREATING batch.
    if (command === '-9') {
        const batch = await findLastCreatingBatch();

        if (!batch) {
            await sendWhatsAppMessage(
                replyTo,
                'No hay un batch activo en estado CREATING.',
            );

            return;
        }

        const identifierCount =
            await countIdentifiersByBatch(batch.id);

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

        return;
    }

    // Command -10: start the identifier move menu.
    if (command === '-10') {
        awaitingMoveIdentifierOption = true;
        awaitingMoveIdentifierBatchId = false;
        awaitingMoveIdentifier = false;
        moveIdentifierOption = null;
        moveIdentifierTargetBatchId = null;

        await sendWhatsAppMessage(
            replyTo,
            [
                'Seleccione una opcion:',
                '1 = Cambiar identificador al batch activo',
                '2 = Cambiar identificador a un batch especifico',
                '3 = Cambiar todos los identificadores del mensaje a un nuevo batch',
            ].join('\n'),
        );

        return;
    }

    if (command === '-11') {
        const counts = await countDocumentsSentTodayByChat();
        let jobsSaved = 0;
        const totalDocumentsSent = counts.reduce(
            (total, item) => total + item.count,
            0,
        );

        for (const item of counts) {
            const job = await createJob({
                type: 'SEND_DOCUMENT_COUNT',
                chatId: item.chatId,
                messageBody: `Conteo final: ${item.count}`,
                scheduledAt: null,
            });

            await scheduleJobSequentially(job.id);
            jobsSaved += 1;
        }

        await sendWhatsAppMessage(
            replyTo,
            [
                `Jobs guardados: ${jobsSaved}`,
                `Documentos enviados hoy: ${totalDocumentsSent}`,
            ].join('\n'),
        );

        return;
    }

    // Handle the option selected after command -10.
    if (awaitingMoveIdentifierOption) {
        if (!['1', '2', '3'].includes(command)) {
            await sendWhatsAppMessage(
                replyTo,
                [
                    'Opcion invalida.',
                    '',
                    '1 = Cambiar identificador al batch activo',
                    '2 = Cambiar identificador a un batch especifico',
                    '3 = Cambiar todos los identificadores del mensaje a un nuevo batch',
                ].join('\n'),
            );

            return;
        }

        awaitingMoveIdentifierOption = false;

        if (command === '1') {
            moveIdentifierOption = 'ACTIVE';
            awaitingMoveIdentifier = true;

            await sendWhatsAppMessage(
                replyTo,
                'Envie el identificador, solo se cambiara el ultimo que se ingreso',
            );

            return;
        }

        if (command === '2') {
            moveIdentifierOption = 'BATCH';
            awaitingMoveIdentifierBatchId = true;

            await sendWhatsAppMessage(
                replyTo,
                'Ingrese el id del batch destino',
            );

            return;
        }

        if (command === '3') {
            moveIdentifierOption = 'MESSAGE';
            awaitingMoveIdentifier = true;

            await sendWhatsAppMessage(
                replyTo,
                'Envie el identificador, solo se cambiara el ultimo que se ingreso',
            );

            return;
        }
    }

    // Handle destination batch ID for command -10 option 2.
    if (awaitingMoveIdentifierBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(
                replyTo,
                'El id del batch debe ser un numero entero.',
            );

            return;
        }

        awaitingMoveIdentifierBatchId = false;
        awaitingMoveIdentifier = true;

        moveIdentifierOption = 'BATCH';
        moveIdentifierTargetBatchId = Number(command);

        await sendWhatsAppMessage(
            replyTo,
            'Envie el identificador, solo se cambiara el ultimo que se ingreso',
        );

        return;
    }

    // Handle identifier requested by command -10.
    if (awaitingMoveIdentifier) {
        const detectedIdentifiers =
            detectIdentifiers(command);

        if (detectedIdentifiers.length === 0) {
            await sendWhatsAppMessage(
                replyTo,
                'No se encontro un identificador valido.',
            );

            // Finish processing the -10 command and reset the state.
            awaitingMoveIdentifier = false;
            moveIdentifierOption = null;
            moveIdentifierTargetBatchId = null;

            return;
        }

        // Only use the last identifier detected in the message.
        const detectedIdentifier =
            detectedIdentifiers[detectedIdentifiers.length - 1];

        const identifier =
            await findLatestIdentifier(
                detectedIdentifier.value,
                detectedIdentifier.type,
            );

        if (!identifier) {
            await sendWhatsAppMessage(
                replyTo,
                `No se encontro el identificador ${detectedIdentifier.value}.`,
            );

            return;
        }

        // Option 1: move the identifier to the active CREATING batch.
        if (moveIdentifierOption === 'ACTIVE') {
            const activeBatch =
                await findLastCreatingBatch();

            if (!activeBatch) {
                await sendWhatsAppMessage(
                    replyTo,
                    'No hay un batch activo en estado CREATING.',
                );

                return;
            }

            await moveIdentifierToBatch(
                identifier.identifierId,
                activeBatch.id,
            );

            await sendWhatsAppMessage(
                replyTo,
                [
                    'Identificador cambiado:',
                    identifier.value,
                    '',
                    `Batch: ${activeBatch.id}`,
                ].join('\n'),
            );
        }

        // Option 2: move the identifier to the selected batch.
        if (moveIdentifierOption === 'BATCH') {
            if (moveIdentifierTargetBatchId === null) {
                await sendWhatsAppMessage(
                    replyTo,
                    'No se ha definido el batch destino.',
                );

                return;
            }

            const targetBatch =
                await findBatchById(
                    moveIdentifierTargetBatchId,
                );

            if (!targetBatch) {
                await sendWhatsAppMessage(
                    replyTo,
                    `No existe el batch ${moveIdentifierTargetBatchId}.`,
                );

                return;
            }

            await moveIdentifierToBatch(
                identifier.identifierId,
                targetBatch.id,
            );

            await sendWhatsAppMessage(
                replyTo,
                [
                    'Identificador cambiado:',
                    identifier.value,
                    '',
                    `Batch: ${targetBatch.id}`,
                ].join('\n'),
            );
        }

        // Option 3: move all identifiers from the message to a new batch.
        if (moveIdentifierOption === 'MESSAGE') {
            const messageIdentifiers =
                await findIdentifiersByMessageId(
                    identifier.messageId,
                );

            if (messageIdentifiers.length === 0) {
                await sendWhatsAppMessage(
                    replyTo,
                    'No se encontraron identificadores en el mensaje.',
                );

                return;
            }

            const newBatch = await createBatch();

            const movedIdentifiers =
                await moveIdentifiersByMessageToBatch(
                    identifier.messageId,
                    newBatch.id,
                );

            await sendWhatsAppMessage(
                replyTo,
                [
                    'Identificadores cambiados:',
                    ...movedIdentifiers.map(
                        ({ value }) => value,
                    ),
                    '',
                    `Nuevo batch: ${newBatch.id}`,
                ].join('\n'),
            );
        }

        // Reset -10 state.
        awaitingMoveIdentifier = false;
        moveIdentifierOption = null;
        moveIdentifierTargetBatchId = null;

        return;
    }

    // Handle batch ID requested by command -2.
    if (awaitingBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(
                replyTo,
                'El id del batch debe ser un numero entero.',
            );

            return;
        }

        awaitingBatchId = false;

        const batchIdentifiers =
            await findIdentifiersByBatchId(
                Number(command),
            );

        if (batchIdentifiers.length === 0) {
            await sendWhatsAppMessage(
                replyTo,
                `No hay identificadores para el batch ${command}.`,
            );

            return;
        }

        const groupedIdentifiers =
            new Map<string, string[]>();

        for (const item of batchIdentifiers) {
            const groupName =
                item.chatName ?? 'Sin nombre';

            const groupIdentifiers =
                groupedIdentifiers.get(groupName) ?? [];

            groupIdentifiers.push(item.identifier);
            groupedIdentifiers.set(
                groupName,
                groupIdentifiers,
            );
        }

        const response =
            [...groupedIdentifiers.entries()]
                .map(([groupName, identifiers]) =>
                    [groupName, ...identifiers].join('\n'),
                )
                .join('\n\n');

        await sendWhatsAppMessage(
            replyTo,
            response,
        );

        return;
    }

    // Handle batch ID requested by command -3/-4.
    if (awaitingZipBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(
                replyTo,
                'El numero del batch debe ser un entero.',
            );

            return;
        }

        zipBatchId = Number(command);
        awaitingZipBatchId = false;

        await sendWhatsAppMessage(
            replyTo,
            'Envie el archivo ZIP con los PDFs.',
        );

        return;
    }

    // Handle batch ID requested by command -5.
    if (awaitingScheduleBatchId) {
        if (!/^\d+$/.test(command)) {
            await sendWhatsAppMessage(
                replyTo,
                'El numero del batch debe ser un entero.',
            );

            return;
        }

        awaitingScheduleBatchId = false;

        const scheduledJobs =
            await scheduleDocumentJobsByBatch(
                Number(command),
            );

        await sendWhatsAppMessage(
            replyTo,
            scheduledJobs > 0
                ? `${scheduledJobs} archivo(s) programado(s) para envio.`
                : `No hay archivos pendientes sin fecha para el batch ${command}.`,
        );

        return;
    }

    // Process the ZIP file after the administrator sends it.
    if (zipBatchId !== null && !command) {
        try {
            const result =
                await saveZipDocuments(
                    message,
                    zipBatchId,
                    scheduleZipJobs,
                );

            pendingZipResult = {
                missingIdentifiers:
                    result.missingIdentifiers,
                unmatched:
                    result.unmatched,
                batchId:
                    zipBatchId,
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
                        ? formatMissingIdentifiers(
                            result.missingIdentifiers,
                        )
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
            await sendWhatsAppMessage(
                replyTo,
                `No se pudo procesar el ZIP: ${String(error)}`,
            );
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
    const unmatchedDirectory =
        `./data/unmatched/batch-${result.batchId}`;

    for (const filename of result.unmatched) {
        const filePath =
            `${unmatchedDirectory}/${filename}`;

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
        identifierId: number;
        messageId: number;
        chatName: string | null;
        identifier: string;
    }>,
): Promise<void> {
    for (const item of missingIdentifiers) {
        const existingJob =
            await findJobByTypeAndIdentifier(
                'SEND_MISSING_IDENTIFIER',
                item.identifierId,
            );

        if (existingJob) {
            continue;
        }

        const job = await createJob({
            type: 'SEND_MISSING_IDENTIFIER',
            messageId: item.messageId,
            identifierId: item.identifierId,
            scheduledAt: null,
        });

        await scheduleJobSequentially(job.id);
    }
}

function formatMissingIdentifiers(
    missingIdentifiers: Array<{
        identifierId: number;
        messageId: number;
        chatName: string | null;
        identifier: string;
    }>,
): string {
    const groupedIdentifiers =
        new Map<string, string[]>();

    for (const item of missingIdentifiers) {
        const groupName =
            item.chatName ?? 'Sin nombre';

        const identifiers =
            groupedIdentifiers.get(groupName) ?? [];

        identifiers.push(item.identifier);
        groupedIdentifiers.set(
            groupName,
            identifiers,
        );
    }

    return [...groupedIdentifiers.entries()]
        .map(([groupName, identifiers]) =>
            [groupName, ...identifiers].join('\n'),
        )
        .join('\n\n');
}

export async function handleIncomingMessage(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    try {
        const chatId = message.from;

        // Ignore private chats except the administrator.
        if (!chatId.endsWith('@g.us')) {
            console.log(chatId, 'chatID');

            if (chatId === ADMIN_JID) {
                await handleAdminMessage(message);
            } else {
                console.log('Ignoring private chat');
            }

            return;
        }

        // Ignore messages sent by the bot itself.
        if (message.key.fromMe) {
            console.log(
                'Ignoring message sent by myself',
            );

            return;
        }

        const groupName =
            whatsappGroups[chatId] ?? chatId;

        const identifiers =
            detectIdentifiers(message.body);

        if (identifiers.length === 0) {
            return;
        }

        const chat =
            await findOrCreateChat({
                whatsappChatId: chatId,
                name: groupName,
                isGroup: true,
            });

        const messageDatetime =
            new Date(message.timestamp * 1000);

        const whatsappMessageId =
            JSON.stringify(message.key);

        const savedMessage =
            await findOrCreateMessage({
                whatsappMessageId,
                chatId: chat.id,
                senderName: message.senderName,
                senderId: message.author ?? '',
                body: message.body,
                messageDatetime,
            });

        const batch =
            await findOrCreateCreatingBatch();

        await createIdentifiers(
            identifiers.map((identifier) => ({
                messageId: savedMessage.id,
                chatId: chat.id,
                value: identifier.value,
                type: identifier.type,
                batchId: batch.id,
            })),
        );

        const existingReactionJob =
            await findJobByTypeAndMessage(
                'REACT_MESSAGE',
                savedMessage.id,
            );

        if (!existingReactionJob) {
            const reactionActive =
                await getReactionActive();

            await createJob({
                type: 'REACT_MESSAGE',
                messageId: savedMessage.id,
                scheduledAt:
                    reactionActive
                        ? new Date(
                            Date.now() +
                            randomReactionDelay(),
                        )
                        : null,
            });
        }
    } catch (error) {
        console.error(
            'Error processing message:',
            error,
        );
    }
}
