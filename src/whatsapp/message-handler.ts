import type { Message } from 'whatsapp-web.js';
import { detectIdentifiers } from '../identifiers/detector';
import { whatsappGroups } from './groups';
import { findOrCreateChat } from '../database/repositories/chats';
import { findOrCreateMessage } from '../database/repositories/messages';

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

        //1 Find or create the chat
        const chat = await findOrCreateChat({
            whatsappChatId: chatId,
            name: groupName,
            isGroup,
        });

        //2 Convert WhatsApp timestamp from seconds to JavaScript Date
        const messageDatetime = new Date(message.timestamp * 1000);

        //3 Save the WhatsApp message
        const savedMessage = await findOrCreateMessage({
            whatsappMessageId: message.id.id,
            chatId: chat.id,
            senderName: message.rawData?.notifyName ?? null,
            senderId: message.author ?? null,
            body: message.body,
            messageDatetime,
        });

        //4 Detect CURP / RFC
        const identifiers = detectIdentifiers(message.body);

        //Logging
        console.log('--------------------------------');
        console.log('Chat ID:', chatId);
        console.log('Group name:', groupName);
        console.log('Database chat ID:', chat.id);
        console.log('Database message ID:', savedMessage.id);
        console.log('Sender ID:', message.author ?? null);
        console.log('Sender name:', message.rawData?.notifyName ?? null);
        console.log('Body:', message.body);
        console.log('Identifiers:', identifiers);
        console.log('Message datetime:', messageDatetime);
        console.log('--------------------------------');
    } catch (error) {
        console.error('Error processing message:', error);
    }
}