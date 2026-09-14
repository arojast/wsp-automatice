import 'dotenv/config';
import { startWhatsAppClient } from './whatsapp/client.js';
import { handleIncomingMessage } from './whatsapp/message-handler.js';
import { startQueueWorker } from './queue/worker.js';

startQueueWorker();

startWhatsAppClient(handleIncomingMessage).catch((error) => {
    console.error('WhatsApp client error:', error);
});