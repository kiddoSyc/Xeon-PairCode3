const express = require('express');
const qrcode = require("qrcode-terminal");
const fs = require('fs');
const pino = require('pino');
const { default: makeWASocket, Browsers, delay, useMultiFileAuthState, fetchLatestBaileysVersion, PHONENUMBER_MCC } = require("@whiskeysockets/baileys");
const chalk = require("chalk");

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Ensure sessions folder exists
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
    console.log(chalk.green('Created sessions folder.'));
}

// Enable mock mode for testing
const MOCK_MODE = process.env.MOCK_MODE === 'true' || false;

async function generatePairCode(phoneNumber) {
    try {
        console.log(chalk.blue(`Starting pair code generation for ${phoneNumber}`));
        if (MOCK_MODE) {
            console.log(chalk.yellow('Using mock mode...'));
            await delay(3000);
            const mockCode = `MOCK-${phoneNumber.slice(1)}-${Date.now().toString().slice(-6)}`;
            console.log(chalk.green(`Mock pair code generated: ${mockCode}`));
            return { code: mockCode };
        }

        const { version } = await fetchLatestBaileysVersion();
        console.log(chalk.blue(`Fetched Baileys version: ${version.join('.')}`));
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');

        const XeonBotInc = makeWASocket({
            logger: pino({ level: 'debug' }), // Enable debug logs
            browser: Browsers.windows('Firefox'),
            auth: { creds: state.creds, keys: state.keys },
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000, // 60s timeout
            keepAliveIntervalMs: 30000, // Keep alive
        });

        let attempts = 0;
        const maxAttempts = 3;

        return new Promise((resolve) => {
            if (!XeonBotInc.authState.creds.registered) {
                phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                console.log(chalk.yellow(`Processing phone number: ${phoneNumber}`));
                if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
                    console.log(chalk.red('Invalid country code'));
                    resolve({ error: "Start with country code, e.g., +2348065593209" });
                    return;
                }

                XeonBotInc.ev.on('creds.update', saveCreds);
                const attemptPairing = async () => {
                    attempts++;
                    try {
                        console.log(chalk.yellow(`Requesting pairing code from Baileys (Attempt ${attempts}/${maxAttempts})...`));
                        let code = await XeonBotInc.requestPairingCode(phoneNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        console.log(chalk.green(`Pair code generated: ${code}`));
                        resolve({ code });
                    } catch (pairingError) {
                        console.error(chalk.red(`Pairing request failed (Attempt ${attempts}):`, pairingError.message));
                        if (attempts < maxAttempts && pairingError.message.includes('Connection Closed')) {
                            console.log(chalk.yellow('Retrying due to connection issue...'));
                            await delay(5000); // Wait before retry
                            attemptPairing();
                        } else {
                            resolve({ error: `Pairing failed after ${attempts} attempts: ${pairingError.message}` });
                        }
                    }
                };
                attemptPairing();
            } else {
                console.log(chalk.yellow('Already registered, skipping pairing.'));
                resolve({ error: "Already registered" });
            }
        });
    } catch (error) {
        console.error(chalk.red('Baileys setup error:', error));
        throw error;
    }
}

// API endpoint for generating pair code
app.post('/generate', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        console.log(chalk.red('No phone number provided'));
        return res.status(400).json({ error: "Phone number is required" });
    }
    try {
        console.log(chalk.blue(`Generating pair code for ${phoneNumber}`));
        const result = await generatePairCode(phoneNumber);
        console.log(chalk.blue(`Result: ${JSON.stringify(result)}`));
        res.json(result);
    } catch (error) {
        console.error(chalk.red('Error in /generate endpoint:', error));
        res.status(500).json({ error: "Failed to generate pair code", details: error.message });
    }
});

// Optional API endpoint to reset sessions
app.post('/reset-sessions', (req, res) => {
    if (fs.existsSync('./sessions')) {
        fs.rmSync('./sessions', { recursive: true, force: true });
    }
    fs.mkdirSync('./sessions');
    console.log(chalk.green('Sessions reset successfully.'));
    res.json({ message: "Sessions reset successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(chalk.green(`Server running on port ${PORT}`));
});
