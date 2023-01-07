import process from 'node:process';
import { logger } from './src/log.js';
import { main } from './src/weekly-playlist-bot.js';

let hasErrors = false;
logger.info('Weekly playlist bot started');
try {
    await main();
} catch (error) {
    hasErrors = true;
    logger.error(error);
}
logger.info(`Weekly playlist bot exited ${hasErrors ? 'with' : 'without'} errors`);
process.exit(hasErrors ? 1 : 0);