import type { Message } from 'whatsapp-web.js';

export async function handleIncomingMessage(message: Message): Promise<void> {
    try {
        const chatId = message.from;

        const isGroup = chatId.endsWith('@g.us');

        if (!isGroup) {
            console.log('Ignoring private chat');
            return;
        }

        console.log('--------------------------------');
        console.log('Chat ID:', chatId);
        console.log('Group ID:', isGroup);
        console.log('Sender ID:', message.author);
        console.log('Sender name:', message.rawData?.notifyName);
        console.log('Body:', message.body);
        console.log('Timestamp:', message.timestamp);
        console.log('--------------------------------');
    } catch (error) {
        console.error('Error processing message:', error);
    }
}