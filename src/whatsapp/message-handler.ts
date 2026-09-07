import { detectIdentifiers } from '../identifiers/detector';
import { whatsappGroups } from './groups';
import { findOrCreateChat } from '../database/repositories/chats';
import { findOrCreateMessage } from '../database/repositories/messages';
import { createIdentifiers } from '../database/repositories/identifiers';
import { findOrCreateCreatingBatch } from '../database/repositories/batches';
import {
    createJob,
    findJobByTypeAndMessage,
} from '../database/repositories/jobs';
import type { IncomingWhatsAppMessage } from './client';

function randomReactionDelay(): number {
    const minimum = 45_000;
    const maximum = 90_000;

    return Math.floor(
        minimum + Math.random() * (maximum - minimum + 1),
    );
}

export async function handleIncomingMessage(message: IncomingWhatsAppMessage): Promise<void> {
    try {
        const chatId = message.from;

        if (!chatId.endsWith('@g.us')) {
            console.log('Ignoring private chat');
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

        console.log('--------------------------------');
        console.log('Chat ID:', chatId);
        console.log('Group name:', groupName);
        console.log('Database chat ID:', chat.id);

        const savedMessage = await findOrCreateMessage({
            whatsappMessageId,
            chatId: chat.id,
            senderName: message.senderName,
            senderId: message.author ?? '',
            body: message.body,
            messageDatetime,
        });

        console.log('Database message ID:', savedMessage.id);
        console.log('Sender ID:', message.author);
        console.log('Sender name:', message.senderName);
        console.log('Body:', message.body);
        console.log('Identifiers:', identifiers);

        const batch = await findOrCreateCreatingBatch();
        const savedIdentifiers = await createIdentifiers(
            identifiers.map((identifier) => ({
                messageId: savedMessage.id,
                chatId: chat.id,
                value: identifier.value,
                type: identifier.type,
                batchId: batch.id,
            })),
        );

        console.log('Identifiers save:', savedIdentifiers);

        const existingReactionJob = await findJobByTypeAndMessage(
            'REACT_MESSAGE',
            savedMessage.id,
        );

        if (!existingReactionJob) {
            const reactionJob = await createJob({
                type: 'REACT_MESSAGE',
                messageId: savedMessage.id,
                scheduledAt: new Date(Date.now() + randomReactionDelay()),
            });

            console.log('Reaction job created:', reactionJob.id);
        } else {
            console.log('Reaction job already exists:', existingReactionJob.id);
        }
        console.log('Message datetime:', messageDatetime);
        console.log('--------------------------------');
    } catch (error) {
        console.error('Error processing message:', error);
    }
}
