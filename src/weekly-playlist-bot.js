import './setup-env.js';
import * as spotify from '../lib/spotify.js';
import * as discord from '../lib/discord.js';
import process from 'node:process';
import getUrls from 'get-urls';

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

export async function getTrackIdsFromDiscordUserSpotifyUrls(discordUserSpotifyUrls) {
    const albumCache = {};
    const playlistCache = {};
    const discordUserSpotifyTrackIds = {};
    for (const userId of Object.keys(discordUserSpotifyUrls)) {
        const spotifyIds = spotify.getIdsFromExternalUrls(discordUserSpotifyUrls[userId]);
        // add tracks to set
        const trackIdSet = new Set(spotifyIds.tracks);
    
        // only query albums not in the cache
        const albumIdsToQuery = spotifyIds.albums.filter((albumId) => albumCache[albumId] == null);
        if (albumIdsToQuery.length > 0) {
            const { albums } = await spotify.getSeveralAlbums(albumIdsToQuery);
            // add to cache
            albums.forEach((album) => { albumCache[album.id] = album.tracks.items });
        }
    
        // add each of the user's album's tracks to set
        for (const albumId of spotifyIds.albums) {
            albumCache[albumId].forEach((track) => trackIdSet.add(track.id));
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
    
        // add each of the user's playlist's tracks to set
        for (const playlistId of spotifyIds.playlists) {
            playlistCache[playlistId].forEach((item) => { 
                if (item.track) trackIdSet.add(item.track.id);
            });
        }
    
        // add track IDs to user map
        discordUserSpotifyTrackIds[userId] = [...trackIdSet];
    }

    return discordUserSpotifyTrackIds;
}

export function buildPlaylistFromUserTracks(discordUserSpotifyTrackIds, discordUserIdToUsername) {
    const playlistContributionMap = {};
    for (const userId of Object.keys(discordUserSpotifyTrackIds)) {
        const username = discordUserIdToUsername[userId];
        const userTrackIds = discordUserSpotifyTrackIds[userId];
        if (userTrackIds.length < 1) continue; // skip users with no tracks
    
        // get a random track from their list to add to playlist
        let selectedTrackId = userTrackIds[Math.floor(Math.random() * userTrackIds.length)];
    
        // if the random track exists in the playlist, find one that is unique to the playlist
        if (Array.isArray(playlistContributionMap[selectedTrackId])) {
            selectedTrackId = userTrackIds.find((trackId) => playlistContributionMap[trackId] == null);
    
            // if we still can't find any unique tracks, add them as a contributor to an existing track
            if (selectedTrackId == null) {
                selectedTrackId = playlistContributionMap[userTrackIds[0]];
                playlistContributionMap[selectedTrackId].push(username);
            } else {
                playlistContributionMap[selectedTrackId] = [username];
            }
        } else {
            playlistContributionMap[selectedTrackId] = [username];
        }
    }

    return playlistContributionMap;
} 

export async function preparePlaylist(playlistName, playlistDescription='') {
    // try to find the named playlist among the bot owner's playlists
    let botOwnerPlaylist;
    let searchingForPlaylist = true;
    let playlistOffset = 0;
    const playlistLimit = 50;
    while (searchingForPlaylist) {
        let botOwnerPlaylistsResp = await spotify.getCurrentUserPlaylists(playlistOffset, playlistLimit);
        botOwnerPlaylist = botOwnerPlaylistsResp.items.find((playlist) => playlist.name === playlistName);

        if (botOwnerPlaylist == null && botOwnerPlaylistsResp.items.length >= playlistLimit) {
            playlistOffset += playlistLimit;
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

export async function main() {
    // 1. Retrieve discord messages from last week
    const { startOfTargetWeek: startOfCurrentWeek, startOfPreviousWeek } = getPreviousWeekDates();
    const discordMessages = await discord.getMessagesInChannel(process.env.DISCORD_CHANNEL_ID, startOfPreviousWeek, startOfCurrentWeek);
    
    // 2. Sift through messages, extracting spotify urls from non-bot messages. Create maps for user ID to user urls 
    // and user ID to usernames
    const { discordUserSpotifyUrls, discordUserIdToUsernames } = extractSpotifyUrlsAndDiscordUserData(discordMessages);
    
    // 3. Parse IDs from spotify urls handling each ID type as follows
    //    a. Track: Add track IDs to the user's trackset
    //    b. Album: Decompose into tracks, add track IDs to the user's trackset
    //    c. Playlist: Decompose into tracks, add track IDs to user's trackset
    const discordUserSpotifyTrackIds = await getTrackIdsFromDiscordUserSpotifyUrls(discordUserSpotifyUrls);
    
    if (Object.keys(discordUserSpotifyTrackIds).length > 0) {
        // 4. Create playlistContributionMap which maps one track from each userTrackList onto an array of contibutorUsernames
        const playlistContributionMap = buildPlaylistFromUserTracks(discordUserSpotifyTrackIds, discordUserIdToUsernames);
        
        // 5. Check if named playlist exists. Save ID + url of the playlist
        //    a. If so, retrieve & delete all items in the playlist
        //    b. If not, create a new playlist with that name
        const endOfPreviousWeek = new Date(startOfCurrentWeek.getTime());
        endOfPreviousWeek.setDate(endOfPreviousWeek.getDate() - 1);
        const playlistDescription = `User contributions for the week of ${startOfPreviousWeek.toLocaleDateString('en-US')} - ${endOfPreviousWeek.toLocaleDateString('en-US')}. Last updated: ${new Date().toLocaleString('en-US')}`;
        const weeklyPlaylist = await preparePlaylist(process.env.PLAYLIST_NAME, `${playlistDescription} `);
        
        // 6. Add the songs in the playlistContributionMap onto the playlist
        const trackUris = Object.keys(playlistContributionMap).map((trackId) => `spotify:track:${trackId}`);
        await spotify.addItemsToPlaylist(weeklyPlaylist.id, trackUris);
        
        // 7. Build and send a discord message with the url
        const { items: weeklyPlaylistItems } = await spotify.getPlaylistItems(weeklyPlaylist.id);
        const announcementMsg = `Playlist for the week of ${startOfPreviousWeek.toLocaleDateString('en-US')} - ${endOfPreviousWeek.toLocaleDateString('en-US')}\n${weeklyPlaylist.url}`;
        let createTextMessageInChannelResp = await discord.createTextMessageInChannel(process.env.DISCORD_CHANNEL_ID, announcementMsg);
    
        // 8. Build and send another message with the list of songs names + contributors
        let contributorMsg = 'Contributors:```\n';
        let contributorIndex = 1;
        weeklyPlaylistItems.forEach((item) => {
            const trackId = item.track?.id;
            if (playlistContributionMap[trackId]) {
                const contributors = playlistContributionMap[trackId].join(', ');
                contributorMsg += `${contributorIndex++}. ${item.track.name} - ${contributors}\n`;
            }
        });
        contributorMsg += '```';
    
        createTextMessageInChannelResp = await discord.createTextMessageInChannel(process.env.DISCORD_CHANNEL_ID, contributorMsg);
    }
}