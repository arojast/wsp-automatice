import { startWhatsAppClient } from './whatsapp/client';
import { handleIncomingMessage } from './whatsapp/message-handler';

startWhatsAppClient(handleIncomingMessage).catch((error) => {
    console.error('WhatsApp client error:', error);
});