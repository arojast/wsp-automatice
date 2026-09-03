import qrcode from 'qrcode-terminal';
import { whatsappClient } from './whatsapp/client';
import { handleIncomingMessage } from './whatsapp/message-handler';

whatsappClient.on('qr', (qr) => {
    console.log('Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('authenticated', () => {
    console.log('WhatsApp authenticated!');
});

whatsappClient.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

whatsappClient.on('auth_failure', (message) => {
    console.error('Authentication failure:', message);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
});

whatsappClient.on('message', handleIncomingMessage);

whatsappClient.initialize();