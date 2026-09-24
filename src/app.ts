import 'dotenv/config';
import { startWhatsAppClient } from './whatsapp/client.js';
import { handleIncomingMessage } from './whatsapp/message-handler.js';
import { startQueueWorker } from './queue/worker.js';
import { markMessageAsDeleted } from './database/repositories/messages.js';

startQueueWorker();

startWhatsAppClient(
    handleIncomingMessage,
    async (key) => {
        if (!key.id) {
            return;
        }

        await markMessageAsDeleted(JSON.stringify(key));
    },
).catch((error) => {
    console.error('WhatsApp client error:', error);
});