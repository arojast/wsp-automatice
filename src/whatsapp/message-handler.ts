import type { Message } from 'whatsapp-web.js';
import { detectIdentifiers } from '../identifiers/detector';
import { whatsappGroups } from './groups';
import { findOrCreateChat } from '../database/repositories/chats';
import { findOrCreateMessage } from '../database/repositories/messages';
import { createIdentifiers } from '../database/repositories/identifiers';
import { findOrCreateCreatingBatch } from '../database/repositories/batches';

export async function handleIncomingMessage(message: Message): Promise<void> {
    try {
        const chatId = message.from;
        const isGroup = chatId.endsWith('@g.us');

        if (!isGroup) {
            console.log('Ignoring private chat');
            return;
        }

        const groupName = whatsappGroups[chatId];

        if (!groupName) {
            console.warn('Unknown WhatsApp group:', chatId, 'senderName:', message.rawData?.notifyName);
        }

        //1 Detect CURP / RFC
        const identifiers = detectIdentifiers(message.body);
        if (identifiers.length > 0) {

            //2 Find or create the chat
            const chat = await findOrCreateChat({
                whatsappChatId: chatId,
                name: groupName,
                isGroup,
            });
            
            console.log('--------------------------------');
            console.log('Chat ID:', chatId);
            console.log('Group name:', groupName);
            console.log('Database chat ID:', chat.id);
            
            //3 Convert WhatsApp timestamp from seconds to JavaScript Date
            const messageDatetime = new Date(message.timestamp * 1000);

            //4 Save the WhatsApp message
            const savedMessage = await findOrCreateMessage({
                whatsappMessageId: message.id.id,
                chatId: chat.id,
                senderName: message.rawData?.notifyName ?? null,
                senderId: message.author ?? null,
                body: message.body,
                messageDatetime,
            });

            console.log('Database message ID:', savedMessage.id);
            console.log('Sender ID:', message.author ?? null);
            console.log('Sender name:', message.rawData?.notifyName ?? null);
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

            console.log('Message datetime:', messageDatetime);
            console.log('--------------------------------');
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
}