import process from 'node:process';
import axios from 'axios';

const DISCORD_EPOCH = 1420070400000;

/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-types
 * @readonly
 * @enum {Number}
 */
export const MessageType = {
    DEFAULT: 0,
    CHANNEL_PINNED_MESSAGE: 6,
};

function getSnowflakeIdFromDate(date = new Date()) {
    return (BigInt(date.getTime() - DISCORD_EPOCH) << 22n).toString();
}

/**
 * Performs a request against Discord's api
 * @param {string} endpoint The Discord api endpoint
 * @param {Object} options Options to pass into the request
 * @returns The response object of the request
 */
export async function discordRequest(endpoint, options) {
    // Stringify payloads
    if (options.data) options.data = JSON.stringify(options.data);

    // append endpoint to root API URL
    let resp = await axios({
        url: `https://discord.com/api/v10/${endpoint}`,
        headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'User-Agent': 'DiscordBot (weekly-playlist-bot, 1.0.0)',
            'Accept-Encoding': 'gzip,deflate,compress',
        },
        ...options
    });

    // throw API errors
    if (resp.status !== 200 && resp.status !== 204) {
        console.log(resp.status);
        throw new Error(JSON.stringify(resp.data));
    }

    return resp;
}

/**
 * Searches for messages in a given channel between the start (inclusive) and end date (non-inclusive). If both dates are
 * supplied, will perform a best effort to retrieve all messages between the two dates in the channel (limited by memory 
 * and discord API). If only afterDate is supplied, it will return the first N messages (limit) after this date. 
 * Otherwise, it will return the first N message before beforeDate or the current date. No message order guaranteed.
 * @param {String} channelId - Discord channel id to search messages in
 * @param {?String|Date} afterDate - The end of the date range to search messages
 * @param {?String|Date} beforeDate - The start of the date range to search messages
 * @param {?Number} limit - Number of messages to return. Default: 100; also the max when not searching between two dates.
 * @returns {Object[]} An array of messages
 */
export async function getMessagesInChannel(channelId, afterDate, beforeDate, limit=100) {
    if (typeof afterDate === 'string') afterDate = new Date(afterDate);
    if (typeof beforeDate === 'string') beforeDate = new Date(beforeDate);

    let urlParams = {
        limit,
    };
    let shouldPaginate = false;
    if (afterDate && beforeDate) {
        shouldPaginate = true;
        urlParams.after = getSnowflakeIdFromDate(afterDate);
    } else if (beforeDate) {
        urlParams.before = getSnowflakeIdFromDate(beforeDate);
    } else if (afterDate) {
        urlParams.after = getSnowflakeIdFromDate(afterDate);
    } else {
        urlParams.before = getSnowflakeIdFromDate();
    }

    let messages = [];
    do {
        let urlParamStr = new URLSearchParams(urlParams).toString();
        let resp = await discordRequest(`channels/${channelId}/messages?${urlParamStr}`, {
            method: 'get'
        });

        let respMessages = resp.data;
        if (shouldPaginate) {
            // filter messages by date
            let doneFiltering = false;
            let latestMessageDate = new Date(DISCORD_EPOCH); // earliest date in discord
            let latestMessageId;
            for (let i = 0; i < respMessages.length; i++) {
                const message = respMessages[i];
                const messageDate = new Date(message.timestamp);
                if (messageDate < beforeDate) {
                    messages.push(message);
                } else {
                    doneFiltering = true;
                }

                if (messageDate > latestMessageDate) {
                    latestMessageDate = messageDate;
                    latestMessageId = message.id;
                }
            }

            // set the id of the last message as the "after" parameter (used for pagination)
            urlParams.after = latestMessageId;

            // determine if we should keep making requests for more messages
            shouldPaginate = (respMessages.length === urlParams.limit && doneFiltering === false);
        } else {
            messages = respMessages;
        }

    } while (shouldPaginate);

    return messages;
}

/**
 * Creates a text message in the given text channel
 * @param {string} channelId Discord channel id to send a message in
 * @param {string} messageContent The text message to send
 * @returns A message object
 */
export async function createTextMessageInChannel(channelId, messageContent) {
    let resp = await discordRequest(`channels/${channelId}/messages`, {
        method: 'post',
        data: { 
            content: messageContent,
        },
    });

    return resp.data;
}

export async function getPinnedMessagesInChannel(channelId) {
    let resp = await discordRequest(`/channels/${channelId}/pins`, {
        method: 'get'
    });

    return resp.data;
}

export async function pinMessageInChannel(channelId, messageId, deletePinNotification) {
    let resp = await discordRequest(`/channels/${channelId}/pins/${messageId}`, {
        method: 'put'
    });

    if (deletePinNotification) {
        await deleteRecentPinNotification(channelId, messageId);
    }

    return resp.data;
}

async function deleteRecentPinNotification(channelId, pinnedMessageId) {
    let recentMessages = await getMessagesInChannel(channelId, null, null, 10); // return only last 10 messages
    let pinNotificationMessage = recentMessages.find((message) => {
        return message.type === MessageType.CHANNEL_PINNED_MESSAGE && message.message_reference.message_id === pinnedMessageId;
    });
    if (pinNotificationMessage) {
        await deleteMessageInChannel(channelId, pinNotificationMessage.id);
    } else {
        throw new Error(`Unable to find pin notification for message id:${pinnedMessageId}`);
    }
}

export async function deleteMessageInChannel(channelId, messageId) {
    let resp = await discordRequest(`/channels/${channelId}/messages/${messageId}`, {
        method: 'delete'
    });

    return resp.data;
}

export async function unpinMessageInChannel(channelId, messageId) {
    let resp = await discordRequest(`/channels/${channelId}/pins/${messageId}`, {
        method: 'delete'
    });

    return resp.data;
}