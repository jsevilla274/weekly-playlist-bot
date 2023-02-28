import './setup-env.js';
import * as spotify from '../lib/spotify.js';
import * as discord from '../lib/discord.js';
import { logger } from './log.js';
import process from 'node:process';
import getUrls from 'get-urls';

/**
 * @param {Date|string} targetDate 
 * @returns {{startOfTargetWeek: Date, startOfPreviousWeek: Date}}
 */
export function getPreviousWeekDates(targetDate) {
    let startOfTargetWeek;
    if (typeof targetDate === 'string') {
        startOfTargetWeek = new Date(targetDate);
    } else if (targetDate == null) {
        startOfTargetWeek = new Date();
    }
    startOfTargetWeek.setDate(startOfTargetWeek.getDate() - startOfTargetWeek.getDay() + 1);
    startOfTargetWeek.setHours(0, 0, 0, 0);
    const startOfPreviousWeek = new Date(startOfTargetWeek.getTime());
    startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7);

    return { startOfTargetWeek, startOfPreviousWeek };
}

/** @typedef {Object.<string,string[]>} DiscordUserIdToSpotifyUrlsMap */

/**
 * maps discord user ID to discord username
 * @typedef {Object.<string,string[]>} DiscordUserIdToUsernameMap
 */

/**
 * @param {Object[]} discordMessages 
 * @returns {{discordUserSpotifyUrls: DiscordUserIdToSpotifyUrlsMap, discordUserIdToUsernames: DiscordUserIdToUsernameMap}} maps of discord user ID to urls and discord username respectively
 */
export function extractSpotifyUrlsAndDiscordUserData(discordMessages) {
    const discordUserSpotifyUrls = {};
    const discordUserIdToUsernames = {};

    for (const message of discordMessages) {
        if (message.author.bot) continue; // skip bot messages
        const discordUsername = message.author.username;
        const discordUserId = message.author.id;

        // Find urls in the message content
        let spotifyUrls = [];
        for (const url of getUrls(message.content, { removeQueryParameters: true })) {
            if (url.includes('open.spotify.com')) {
                spotifyUrls.push(url);
            }
        }

        // Append urls from this message into user's list of URLs
        if (Array.isArray(discordUserSpotifyUrls[discordUserId])) {
            discordUserSpotifyUrls[discordUserId] = discordUserSpotifyUrls[discordUserId].concat(spotifyUrls);
        } else {
            discordUserSpotifyUrls[discordUserId] = spotifyUrls;
        }

        // Add discord ID -> username mapping
        if (!discordUserIdToUsernames[discordUserId]) discordUserIdToUsernames[discordUserId] = discordUsername;
    }

    return { discordUserSpotifyUrls, discordUserIdToUsernames };
}

/**
 * @typedef UserTrackIds
 * @type {object}
 * @property {string[]} singleTrackIds - track ids obtained from direct track links
 * @property {string[]} albumTrackIds - track ids obtained from playlist links
 * @property {string[]} playlistTrackIds - track ids obtained from album links
 *
 * @typedef {Object.<string,UserTrackIds>} DiscordUserIdToSpotifyTrackIdsMap 
*/

/**
 * @param {DiscordUserIdToSpotifyUrlsMap} discordUserSpotifyUrls 
 * @returns {DiscordUserIdToSpotifyTrackIdsMap} 
 */
export async function getTrackIdsFromDiscordUserSpotifyUrls(discordUserSpotifyUrls) {
    const albumCache = {};
    const playlistCache = {};
    const discordUserSpotifyTrackIds = {};
    for (const userId of Object.keys(discordUserSpotifyUrls)) {
        const spotifyIds = spotify.getIdsFromExternalUrls(discordUserSpotifyUrls[userId]);
        // add tracks to sets (implicitly discards duplicates)
        const singleTrackIdsSet = new Set(spotifyIds.tracks);
        const playlistTrackIdsSet = new Set();
        const albumTrackIdsSet = new Set();
        let uniqueTrackCount = singleTrackIdsSet.size;

        // only query albums not in the cache
        const albumIdsToQuery = spotifyIds.albums.filter((albumId) => albumCache[albumId] == null);
        if (albumIdsToQuery.length > 0) {
            const { albums } = await spotify.getSeveralAlbums(albumIdsToQuery);
            // add to cache
            albums.forEach((album) => { albumCache[album.id] = album.tracks.items });
        }
    
        // add album tracks to user's album track set
        for (const albumId of spotifyIds.albums) {
            albumCache[albumId].forEach((track) => {
                if (albumTrackIdsSet.has(track.id) === false) {
                    albumTrackIdsSet.add(track.id);
                    
                    const isUniqueTrack = singleTrackIdsSet.has(track.id) === false;
                    if (isUniqueTrack) uniqueTrackCount++;
                }
            });
        }

        // only query playlists not in the cache
        const playlistIdsToQuery = spotifyIds.playlists.filter((playlistId) => playlistCache[playlistId] == null);
        const gpiPromises = [];
        for (const playlistId of playlistIdsToQuery) {
            gpiPromises.push(spotify.getPlaylistItems(playlistId).then((playlist) => { 
                playlistCache[playlistId] = playlist.items;
            }));
        }
        await Promise.all(gpiPromises);
    
        // add playlist tracks to user's playlist track set
        for (const playlistId of spotifyIds.playlists) {
            playlistCache[playlistId].forEach((item) => { 
                if (item.track && playlistTrackIdsSet.has(item.track.id) === false) {
                    playlistTrackIdsSet.add(item.track.id);
                    
                    const isUniqueTrack = singleTrackIdsSet.has(item.track.id) === false && albumTrackIdsSet.has(item.track.id) === false;
                    if (isUniqueTrack) uniqueTrackCount++;
                }
            });
        }
    
        // add track IDs to user map
        discordUserSpotifyTrackIds[userId] = {
            singleTrackIds: [...singleTrackIdsSet],
            albumTrackIds: [...albumTrackIdsSet],
            playlistTrackIds: [...playlistTrackIdsSet],
            uniqueTrackCount,
        };
    }

    return discordUserSpotifyTrackIds;
}

/**
 * shuffles an array *in-place*
 * @param {any[]} array 
 * @returns {any[]} the same passed in array
 */
function shuffleArray(array) {
    let unshuffledCount = array.length;
    let temp, randI;
  
    while (unshuffledCount > 0) {
  
      // pick a remaining element
      randI = Math.floor(Math.random() * unshuffledCount);
      unshuffledCount--;
  
      // swap it with the "end" that stores shuffled elements
      temp = array[unshuffledCount];
      array[unshuffledCount] = array[randI];
      array[randI] = temp;
    }
  
    return array;
}

/** 
 * maps a spotify track id to an array of discord usernames
 * @typedef {Object.<string, string[]>} SpotifyTrackToDiscordUsernamesMap 
 */

/**
 * @param {DiscordUserIdToSpotifyTrackIdsMap} discordUserSpotifyTrackIds 
 * @param {DiscordUserIdToUsernameMap} discordUserIdToUsername 
 * @returns {SpotifyTrackToDiscordUsernamesMap}
 */
export function buildPlaylistFromUserTracks(discordUserSpotifyTrackIds, discordUserIdToUsername) {
    const playlistContributionMap = {};
    for (const userId of Object.keys(discordUserSpotifyTrackIds)) {
        const username = discordUserIdToUsername[userId];
        const { singleTrackIds, playlistTrackIds, albumTrackIds, uniqueTrackCount } = discordUserSpotifyTrackIds[userId];

        // skip users with no tracks
        if (uniqueTrackCount < 1) continue; 

        // get a smaller number of tracks from user based on log_2 (at least 1)
        let userTracksNeeded = Math.floor(Math.log(uniqueTrackCount) / Math.log(2)) || 1;

        // go through the shuffled tracks, adding as many unique tracks as needed to the playlist
        const nonUniqueContributions = [];
        let trackIdArr = shuffleArray(singleTrackIds); // shuffle before use
        for (let i = 0; i <= trackIdArr.length && userTracksNeeded > 0; i++) {
            if (i === trackIdArr.length) {
                // swap track arr by track array "priority" (single > playlist > album)
                if (trackIdArr === singleTrackIds) {
                    i = -1;
                    trackIdArr = shuffleArray(playlistTrackIds);
                } else if (trackIdArr === playlistTrackIds) {
                    i = -1;
                    trackIdArr = shuffleArray(albumTrackIds);
                } // else exit loop
            } else {
                // add tracks to playlist
                const trackId = trackIdArr[i];
                const trackIdHasContributors = Array.isArray(playlistContributionMap[trackId]); 
    
                if (trackIdHasContributors) {
                    // save in case we run out of unique track contributions
                    nonUniqueContributions.push(trackId);
                } else {
                    playlistContributionMap[trackId] = [username];
                    userTracksNeeded--;
                }
            }
        }

        // if tracks are still needed, add the user as a contributor to existing tracks
        for (let i = 0; i < nonUniqueContributions.length && userTracksNeeded > 0; i++) {
            const trackId = nonUniqueContributions[i];
            const trackIdContibutors = playlistContributionMap[trackId];

            // only add user as contributor if not already a contributor (avoids duplicate contributions)
            if (trackIdContibutors.includes(username) === false) {
                playlistContributionMap[trackId].push(username);
                userTracksNeeded--;
            }
        }
    }

    return playlistContributionMap;
} 

/**
 * Creates/clears playlist so that new items may be added into it
 * @param {string} playlistName 
 * @param {?string} playlistDescription 
 * @returns {{id: string, url: string}} prepared playlist data
 */
export async function preparePlaylist(playlistName, playlistDescription='') {
    // try to find the named playlist among the bot owner's playlists
    let botOwnerPlaylist;
    let searchingForPlaylist = true;
    let searchOffset = 0;
    const searchLimit = 50;
    while (searchingForPlaylist) {
        let botOwnerPlaylistsResp = await spotify.getCurrentUserPlaylists(searchOffset, searchLimit);
        botOwnerPlaylist = botOwnerPlaylistsResp.items.find((playlist) => playlist.name === playlistName);

        if (botOwnerPlaylist == null && botOwnerPlaylistsResp.items.length >= searchLimit) {
            searchOffset += searchLimit;
        } else {
            searchingForPlaylist = false;
        }
    }

    // if the named playlist exists, delete all items from the playlist
    if (botOwnerPlaylist) {
        let botOwnerPlaylistItemsResp = await spotify.getPlaylistItems(botOwnerPlaylist.id);
    
        if (botOwnerPlaylistItemsResp.items.length > 0) {
            let trackURIsToDelete = botOwnerPlaylistItemsResp.items.map((item) => { return { uri: item.track.uri } });
            let removePlaylistItemsResp = await spotify.removePlaylistItems(botOwnerPlaylist.id, trackURIsToDelete);
            let changePlaylistDetailsResp = await spotify.changePlaylistDetails(botOwnerPlaylist.id, { description: playlistDescription });
        }
    } else { // if it doesn't exist, create a new playlist with the given name
        let botOwnerProfileResp = await spotify.getCurrentUserProfile();
        let botOwnerUserId = botOwnerProfileResp.id;
        botOwnerPlaylist = await spotify.createPlaylist(botOwnerUserId, {
            name: playlistName,
            public: false,
            collaborative: false,
            description: playlistDescription,
        });
    }

    return {
        id: botOwnerPlaylist.id,
        url: botOwnerPlaylist.external_urls.spotify,
    };
}

/**
 * Finds the previously pinned bot post (if it exists) and unpins it
 * @param {string} channelId id of the discord channel to search for pins
 * @param {string} messagePrefix the beginning part of the bot message used to identify the previous pin
 */
export async function unpinPreviousBotPost(channelId, messagePrefix) {
    const pinnedDiscordMessages = await discord.getPinnedMessagesInChannel(channelId);
    const previousPinnedBotMessage = pinnedDiscordMessages.find((message) => message.author.bot && message.content.startsWith(messagePrefix));
    if (previousPinnedBotMessage) {
        await discord.unpinMessageInChannel(channelId, previousPinnedBotMessage.id);
    } // else no pinned message found
}

export async function main() {
    // 1. Retrieve discord messages from last week
    const { startOfTargetWeek: startOfCurrentWeek, startOfPreviousWeek } = getPreviousWeekDates(); // pass in a date to test for a different week
    const discordMessages = await discord.getMessagesInChannel(process.env.DISCORD_CHANNEL_ID, startOfPreviousWeek, startOfCurrentWeek);
    
    // 2. Sift through messages, extracting spotify urls from non-bot messages. Create maps for user ID to user urls 
    // and user ID to usernames
    const { discordUserSpotifyUrls, discordUserIdToUsernames } = extractSpotifyUrlsAndDiscordUserData(discordMessages);
    
    // 3. Parse IDs from spotify urls handling each ID type as follows
    //    a. Track: Add track IDs to the user's trackset
    //    b. Album: Decompose into tracks, add track IDs to the user's trackset
    //    c. Playlist: Decompose into tracks, add track IDs to user's trackset
    const discordUserSpotifyTrackIds = await getTrackIdsFromDiscordUserSpotifyUrls(discordUserSpotifyUrls);
    
    // create week string for display purposes
    const endOfPreviousWeek = new Date(startOfCurrentWeek.getTime());
    endOfPreviousWeek.setDate(endOfPreviousWeek.getDate() - 1);
    const formattedWeekStr = `${startOfPreviousWeek.toLocaleDateString('en-US')} - ${endOfPreviousWeek.toLocaleDateString('en-US')}`;

    // check if contributions exist, existing if none found
    const contributionsExist = Object.keys(discordUserSpotifyTrackIds).some((userId) => discordUserSpotifyTrackIds[userId].uniqueTrackCount > 0);
    if (contributionsExist === false) {
        logger.info(`No contributions found for the week of ${formattedWeekStr}. Playlist was not updated.`);
        return; // exit main
    }

    // 4. Create playlistContributionMap which maps one track from each userTrackList onto an array of contibutorUsernames
    const playlistContributionMap = buildPlaylistFromUserTracks(discordUserSpotifyTrackIds, discordUserIdToUsernames);
    
    // 5. Check if named playlist exists. Save ID + url of the playlist
    //    a. If so, retrieve & delete all items in the playlist
    //    b. If not, create a new playlist with that name
    const playlistDescription = `User contributions for the week of ${formattedWeekStr}. Last updated: ${new Date().toLocaleString('en-US')}`;
    const weeklyPlaylist = await preparePlaylist(process.env.PLAYLIST_NAME, `${playlistDescription} `);
    
    // 6. Add the songs in the playlistContributionMap onto the playlist
    const trackUris = Object.keys(playlistContributionMap).map((trackId) => `spotify:track:${trackId}`);
    await spotify.addItemsToPlaylist(weeklyPlaylist.id, trackUris);
    
    // 7. Build and send a discord message with the url
    const announcementMsgPrefix = 'Playlist for the week of';
    const announcementMsg = `${announcementMsgPrefix} ${formattedWeekStr}\n${weeklyPlaylist.url}`;
    let playlistTextMessage = await discord.createTextMessageInChannel(process.env.DISCORD_CHANNEL_ID, announcementMsg);
    
    // 8. Build and send another message with the list of songs names + contributors
    const { items: weeklyPlaylistItems } = await spotify.getPlaylistItems(weeklyPlaylist.id);
    let contributorsMsg = 'Contributors:```\n';
    let contributorIndex = 1;
    weeklyPlaylistItems.forEach((item) => {
        const trackId = item.track?.id;
        if (playlistContributionMap[trackId]) {
            const contributors = playlistContributionMap[trackId].join(', ');
            const trackArtists = item.track.artists.map((artist) => artist.name).join(', ');
            contributorsMsg += `${contributorIndex++}. ${item.track.name} by ${trackArtists} - ${contributors}\n`;
        }
    });
    contributorsMsg += '```';
    
    let contributorsTextMessage = await discord.createTextMessageInChannel(process.env.DISCORD_CHANNEL_ID, contributorsMsg);
    logger.info(`Playlist updated for the week of ${formattedWeekStr}`);
    
    // 9. Unpin the previous playlist message (if it exists) and pin the new one
    await unpinPreviousBotPost(process.env.DISCORD_CHANNEL_ID, announcementMsgPrefix);
    await discord.pinMessageInChannel(process.env.DISCORD_CHANNEL_ID, playlistTextMessage.id);
}