import { Client, LocalAuth } from 'whatsapp-web.js';

export const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // show into screen the activity of the browser
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});
