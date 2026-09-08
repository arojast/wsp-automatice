import type { WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

export type IncomingWhatsAppMessage = {
    from: string;
    body: string;
    author: string | null;
    senderName: string | null;
    timestamp: number;
    id: string;
    key: WAMessageKey;
    rawData: WAMessage;
};

type WhatsAppSocket = ReturnType<
    (typeof import('@whiskeysockets/baileys'))['default']
>;

let whatsappSocket: WhatsAppSocket | null = null;
let preOpenReconnectAttempts = 0;

function getMessageBody(message: WAMessage): string {
    const content = message.message;

    return (
        content?.conversation ??
        content?.extendedTextMessage?.text ??
        content?.imageMessage?.caption ??
        content?.videoMessage?.caption ??
        ''
    );
}

function toIncomingMessage(message: WAMessage): IncomingWhatsAppMessage | null {
    const chatId = message.key.remoteJid;
    const body = getMessageBody(message);

    if (!chatId || !message.key.id || !body) {
        return null;
    }

    return {
        from: chatId,
        body,
        author: message.key.participant ?? (message.key.fromMe ? chatId : null),
        senderName: message.pushName ?? null,
        timestamp: Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000)),
        id: message.key.id,
        key: message.key,
        rawData: message,
    };
}

export async function startWhatsAppClient(
    onMessage: (message: IncomingWhatsAppMessage) => Promise<void>,
): Promise<void> {
    const {
        default: makeWASocket,
        DisconnectReason,
        useMultiFileAuthState,
    } = await import('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState('./data/baileys-auth');
    let connectionWasOpened = false;

    whatsappSocket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Enlace Fiscal', 'Chrome', '1.0.0'],
    });

    whatsappSocket.ev.on('creds.update', saveCreds);
    whatsappSocket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            connectionWasOpened = true;
            preOpenReconnectAttempts = 0;
            console.log('WhatsApp client is ready!');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
            console.error('WhatsApp connection closed:', {
                statusCode,
                reason: lastDisconnect?.error instanceof Error
                    ? lastDisconnect.error.message
                    : String(lastDisconnect?.error),
            });

            if (
                statusCode === DisconnectReason.restartRequired ||
                (statusCode !== DisconnectReason.loggedOut &&
                    (connectionWasOpened || preOpenReconnectAttempts < 3))
            ) {
                preOpenReconnectAttempts += 1;
                setTimeout(() => {
                    void startWhatsAppClient(onMessage);
                }, 1_000);
            } else if (!connectionWasOpened) {
                console.error(
                    'WhatsApp could not complete authentication. Check the status code above, unlink this device in WhatsApp, remove data/baileys-auth, and pair again.',
                );
            } else {
                console.error('WhatsApp session logged out; scan the QR again.');
            }
        }
    });

    whatsappSocket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') {
            return;
        }

        for (const message of messages) {
            const incomingMessage = toIncomingMessage(message);

            if (incomingMessage) {
                await onMessage(incomingMessage);
            }
        }
    });
}

export async function reactToMessage(
    key: WAMessageKey,
    reaction: string,
): Promise<void> {
    if (!whatsappSocket || !key.remoteJid || !key.id) {
        throw new Error('WhatsApp socket is not ready');
    }

    await whatsappSocket.sendMessage(key.remoteJid, {
        react: {
            text: reaction,
            key,
        },
    });
}

export async function sendWhatsAppMessage(
    jid: string,
    text: string,
): Promise<void> {
    if (!whatsappSocket) {
        throw new Error('WhatsApp socket is not ready');
    }

    await whatsappSocket.sendMessage(jid, { text });
}
