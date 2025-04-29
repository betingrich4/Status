import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
    getContentType
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { File } from 'megajs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';
import { initAutoBio, stopAutoBio } from './plugins/autobio.js';
import { startStatusWatcher } from './plugins/statusWatcher.js';

const { emojis, doReact } = pkg;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

// Deployment tracking
const deploymentLogFile = 'deployment_log.json';
let dailyDeployments = 0;
let totalDeployments = 0;

if (fs.existsSync(deploymentLogFile)) {
    const data = JSON.parse(fs.readFileSync(deploymentLogFile, 'utf-8'));
    const today = moment().tz(config.TIME_ZONE || 'Africa/Nairobi').format('YYYY-MM-DD');
    dailyDeployments = data.date === today ? data.dailyCount : 0;
    totalDeployments = data.totalCount || 0;
}

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'sessions');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function downloadSessionData(sessionId) {
    if (!sessionId) {
        console.error('Session ID is required!');
        return false;
    }

    const sessdata = sessionId.split("StatusBot~")[1];
    if (!sessdata || !sessdata.includes("#")) {
        console.error('Invalid SESSION_ID format!');
        return false;
    }

    const [fileID, decryptKey] = sessdata.split("#");
    try {
        console.log("Downloading Session...");
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => err ? reject(err) : resolve(data));
        });
        await fs.promises.writeFile(credsPath, data);
        console.log("Session Successfully Loaded !!");
        return true;
    } catch (error) {
        console.error('Failed to download session:', error);
        return false;
    }
}

async function start(sessionId = null) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const Matrix = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: useQR,
        browser: Browsers.macOS("Safari"),
        auth: state,
        msgRetryCounterCache,
        getMessage: async (key) => {
            return { conversation: "WhatsApp Status Bot" };
        }
    });

    Matrix.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            stopAutoBio();
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                start(sessionId);
            }
        } else if (connection === 'open') {
            if (initialConnection) {
                console.log(chalk.green("✓ Connected Successfully"));
                
                // Initialize all automated features
                await Promise.all([
                    initAutoBio(Matrix),
                    startStatusWatcher(Matrix)
                ]);
                
                await sendWelcomeMessage(Matrix);
                initialConnection = false;
            }
        }
    });

    Matrix.ev.on('creds.update', saveCreds);
    Matrix.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, Matrix, logger));
    Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
    Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

    return Matrix;
}

async function sendWelcomeMessage(Matrix) {
    await Matrix.sendMessage(Matrix.user.id, {
        image: { url: "https://files.catbox.moe/wwl2my.jpg" },
        caption: `*WhatsApp Status Bot Connected!*\n\n` +
                 `🔹 *Auto Status Viewer:* Enabled\n` +
                 `❤️ *Auto Reactions:* ${config.AUTO_STATUS_REACT === "true" ? "Enabled" : "Disabled"}\n` +
                 `📝 *Auto Bio:* ${config.AUTO_BIO_ENABLED === "true" ? "Enabled" : "Disabled"}\n\n` +
                 `📅 *Date:* ${moment().tz(config.TIME_ZONE || 'Africa/Nairobi').format('Do MMMM YYYY')}`,
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true
        }
    });
}

async function init() {
    if (fs.existsSync(credsPath)) {
        console.log("🔒 Session file found");
        await start();
    } else if (process.env.SESSION_ID) {
        const sessionDownloaded = await downloadSessionData(process.env.SESSION_ID);
        if (sessionDownloaded) await start();
        else {
            useQR = true;
            await start();
        }
    } else {
        useQR = true;
        await start();
    }
}

// Express server for web interface
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Status Bot</h1>
        <p>Bot is running. Use WhatsApp to interact with the bot.</p>
    `);
});

app.listen(PORT, () => {
    console.log(chalk.green(`🌐 Server running on port ${PORT}`));
    init();
});
