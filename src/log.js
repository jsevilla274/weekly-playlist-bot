import path from 'path';
import { createLogger, format, transports } from 'winston';
import { fileURLToPath } from 'url';
const { combine, timestamp, printf } = format;
const currentDirname = path.dirname(fileURLToPath(import.meta.url));

function getLocalISOString(date) {
    date = date?.getDate() ? date : new Date();
    
    let month = (date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1));
    let day = (date.getDate() > 9) ? date.getDate() : ('0' + date.getDate());
    let year = date.getFullYear();
    let hours = (date.getHours() > 9) ? date.getHours() : ('0' + date.getHours());
    let minutes = (date.getMinutes() > 9) ? date.getMinutes() : ('0' + date.getMinutes());
    let seconds = (date.getSeconds() > 9) ? date.getSeconds() : ('0' + date.getSeconds());
    let ms = date.getMilliseconds();
    if (ms < 10) {
        ms = '00' + ms;
    } else if (ms < 100) {
        ms = '0' + ms;
    }
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

const myFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});

export const logger = createLogger({
    format: combine(
        timestamp({ format: getLocalISOString }),
        myFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(currentDirname, '..', 'info.log') }),
    ]
});