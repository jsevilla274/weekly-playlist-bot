import * as dotenv from 'dotenv';
import process from 'node:process';
import * as pathLib from 'path';
import { fileURLToPath } from 'url';

const currentDirname = pathLib.dirname(fileURLToPath(import.meta.url));

const keys = [
    'SPOTIFY_CLIENT_SECRET', 
    'SPOTIFY_CLIENT_ID', 
    'SPOTIFY_CALLBACK_PORT', 
    'DISCORD_TOKEN', 
    'DISCORD_CHANNEL_ID',
    'PLAYLIST_NAME'
];

if (!process.env[keys[0]]) {
    dotenv.config({ path: pathLib.join(currentDirname, '..', '.env') });
    keys.forEach((key) => {
        if (!process.env[key]) {
            throw new Error(`Please set the environmental variable: ${key}`);
        }
    });
}
