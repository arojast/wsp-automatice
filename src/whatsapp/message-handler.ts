import type { Message } from 'whatsapp-web.js';
import { detectIdentifiers } from '../identifiers/detector';
import { whatsappGroups } from './groups';
import { findOrCreateChat } from '../database/repositories/chats';

export async function handleIncomingMessage(message: Message): Promise<void> {
    try {
        const chatId = message.from;

        const isGroup = chatId.endsWith('@g.us');

        if (!isGroup) {
            console.log('Ignoring private chat');
            return;
        }

        const groupName = whatsappGroups[chatId];

        const identifiers = detectIdentifiers(message.body);

        console.log('--------------------------------');
        console.log('Chat ID:', chatId);
        console.log('Group ID:', isGroup);
        console.log('Group name:', groupName);
        console.log('Sender ID:', message.author ?? null);
        console.log('Sender name:', message.rawData?.notifyName ?? null);
        console.log('Body:', message.body);
        console.log('Identifiers:', identifiers);
        console.log('Timestamp:', message.timestamp);

        let chat = await findOrCreateChat({
            whatsappChatId: chatId,
            name: groupName ?? '',
            isGroup: isGroup,
        });
        console.log('++++++++++++++++++++++++++++++++');
        console.log('Chat record:', chat);
        console.log('++++++++++++++++++++++++++++++++');
        console.log('--------------------------------');
    } catch (error) {
        console.error('Error processing message:', error);
    }
}