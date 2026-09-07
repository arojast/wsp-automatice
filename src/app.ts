import { startWhatsAppClient } from './whatsapp/client';
import { handleIncomingMessage } from './whatsapp/message-handler';
import { startQueueWorker } from './queue/worker';

startQueueWorker();

startWhatsAppClient(handleIncomingMessage).catch((error) => {
    console.error('WhatsApp client error:', error);
});