import process from 'node:process';
import { Buffer } from 'node:buffer';
import { fileURLToPath, URL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';

export const mainDomain = 'open.spotify.com';
export const shortenedDomains = ['spotify.link', 'spotify.app.link'];

const redirect_uri = `http://localhost:${process.env.SPOTIFY_CALLBACK_PORT}/callback`; // Your redirect uri
const scope = 'user-read-private user-read-email playlist-read-private playlist-modify-private';
const currentDirname = path.dirname(fileURLToPath(import.meta.url));
let tokens;

/**
* Generates a random string containing numbers and letters
* @param {number} length The length of the string
* @return {string} The generated string
*/
function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Gets the ID portion of "https://open.spotify.com/" external urls
 * @param {string[]} urls The urls to process 
 * @return {Object} An object containing the ids by type derived from the urls
 */
export function getIdsFromExternalUrls(urls) {
    let ids = {
        tracks: [],
        playlists: [],
        albums: [],
    };
    
    ids = urls.reduce((foundIds, url) => {
        let urlPathComponents = new URL(url).pathname.split('/'); // e.g. [ '', 'playlist', '68wXeUJO6sv1aXVm5uOFCk' ]
        if (urlPathComponents.length >= 3) {          
            let itemType = urlPathComponents[1];
            let itemId = urlPathComponents[2];
            
            if (itemType === 'track') {
                foundIds.tracks.push(itemId);
            } else if (itemType === 'playlist') {
                foundIds.playlists.push(itemId);
            } else if (itemType === 'album') {
                foundIds.albums.push(itemId);
            } // not a valid url/item type
        }
        
        return foundIds;
    }, ids);
    
    return ids;
}

async function getAuthorization() {
    const { default: express } = await import('express');
    const { default: cors } = await import('cors');
    const { default: open } = await import('open');
    
    let server, authoritativeState;
    let app = express();
    app.use(cors());
    
    // configure oauth callback, associate it with promise
    let authCodePromise = new Promise((resolve, reject) => {
        app.get('/callback', (req, res) => {
            // your application requests refresh and access tokens
            // after checking the state parameter
            let code = req.query.code || null;
            let state = req.query.state || null;
            
            if (state === null || state !== authoritativeState) {
                // do nothing, wait for a proper request
            } else {
                res.send('<p>Authorization complete, this page may be closed.</p>');
                resolve({ code, state });
            }
        });
    });
    
    // start server
    server = app.listen(process.env.SPOTIFY_CALLBACK_PORT);
    
    // request auth code from spotify
    authoritativeState = generateRandomString(16);
    open('https://accounts.spotify.com/authorize?' + 
        new URLSearchParams({
            response_type: 'code',
            client_id: process.env.SPOTIFY_CLIENT_ID,
            scope: scope,
            redirect_uri: redirect_uri,
            state: authoritativeState
        }).toString()
    );
    
    // wait for user redirect after spotify authorization
    let { code } = await authCodePromise;
    
    // close server
    server.close();
    
    // request access token using auth code
    let postConfig = {
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: new URLSearchParams({
            code,
            redirect_uri,
            grant_type: 'authorization_code'
        }),
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
    
    let resp = await axios(postConfig);
    
    let authTokens;
    if (resp.status === 200) {
        let tokenExpireAfter = new Date();
        tokenExpireAfter.setSeconds(tokenExpireAfter.getSeconds() + resp.data.expires_in);
        
        authTokens = {
            access_token: resp.data.access_token,
            refresh_token: resp.data.refresh_token,
            expire_after: tokenExpireAfter.toISOString(),
        };
    } else {
        throw new Error(`Unexpected status: ${resp.status}`);
    }
    
    return authTokens;
}

async function refreshAccessToken(oldTokens) {
    // requesting access token from refresh token
    let postConfig = {
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: oldTokens.refresh_token,
        }),
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
    
    let resp = await axios(postConfig);
    
    let authTokens;
    if (resp.status === 200) {
        let tokenExpireAfter = new Date();
        tokenExpireAfter.setSeconds(tokenExpireAfter.getSeconds() + resp.data.expires_in);
        
        authTokens = {
            access_token: resp.data.access_token,
            refresh_token: oldTokens.refresh_token,
            expire_after: tokenExpireAfter.toISOString(),
        };
    } else {
        throw new Error(`Unexpected status: ${resp.status}`);
    }
    
    return authTokens;
}

async function loadAuthTokens() {
    const configFilename = path.join(currentDirname, '..', 'tokens.json');
    let authTokens;
    try {        
        authTokens = JSON.parse(await fs.readFile(configFilename, 'utf-8'));
        if (new Date() > new Date(authTokens.expire_after)) {
            authTokens = await refreshAccessToken(authTokens);
            await fs.writeFile(configFilename, JSON.stringify(authTokens, null, 2), 'utf-8');
        } // else access token still valid
    } catch (error) {
        // tokens.json does not exist, get tokens through authorization
        authTokens = await getAuthorization();
        await fs.writeFile(configFilename, JSON.stringify(authTokens, null, 2), 'utf-8');
    }
    
    return authTokens;
}

/**
 * Performs a request against Spotify's api
 * @param {string} endpoint The spotify api endpoint
 * @param {object} options Options to pass into the request
 * @returns The response object of the request
 */
export async function spotifyRequest(endpoint, options) {
    // load tokens globally
    if (!tokens) tokens = await loadAuthTokens();

    // stringify payloads
    if (options.data) options.data = JSON.stringify(options.data);

    // append endpoint to root API URL
    let resp = await axios({
        url: `https://api.spotify.com/v1/${endpoint}`,
        headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        ...options
    });

    // throw API errors
    if (resp.status !== 200 && resp.status !== 201) {
        throw new Error(JSON.stringify(resp));
    }

    return resp;
}

export async function getCurrentUserProfile() {
    let resp = await spotifyRequest('me', {
        method: 'get'
    });
    
    return resp.data;
}

export async function getCurrentUserPlaylists(offset=0, limit=50) {
    let queryParams = {
        limit,
        offset,
    };
    let resp = await spotifyRequest(`me/playlists?${new URLSearchParams(queryParams).toString()}`, {
        method: 'get'
    });
    
    return resp.data;
}

export async function getPlaylistItems(playlistId) {
    let resp = await spotifyRequest(`playlists/${playlistId}/tracks`, {
        method: 'get'
    });
    
    return resp.data;
}

export async function removePlaylistItems(playlistId, trackURIs) {
    let resp = await spotifyRequest(`playlists/${playlistId}/tracks`, {
        method: 'delete',
        data: { tracks: trackURIs },
    });
    
    return resp.data;
}

export async function createPlaylist(userId, playlistOptions) {
    let resp = await spotifyRequest(`users/${userId}/playlists`, {
        method: 'post',
        data: playlistOptions,
    });
    
    return resp.data;
}

export async function addItemsToPlaylist(playlistId, trackURIs) {
    let resp = await spotifyRequest(`playlists/${playlistId}/tracks`, {
        method: 'post',
        data: { uris: trackURIs },
    });
    
    return resp.data;
}

export async function getSeveralAlbums(albumIds) {
    let resp = await spotifyRequest(`albums?ids=${albumIds.join(',')}`, {
        method: 'get',
    });
    
    return resp.data;
}

export async function changePlaylistDetails(playlistId, playlistOptions) {
    let resp = await spotifyRequest(`playlists/${playlistId}`, {
        method: 'put',
        data: playlistOptions,
    });
    
    return resp.data;
}

// obtain long URL from shortened link redirects
export async function getLongURL(shortenedURL) {
    const maxRedirects = 10;
    let longURL = null;
    let currentURL = shortenedURL;
    for (let i = 0; longURL === null && currentURL && i < maxRedirects; i++) {        
        let resp = await axios({
            method: 'get',
            url: currentURL,
            maxRedirects: 0,
            validateStatus: null,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' }
        });
    
        currentURL = resp.headers.location;
        if (currentURL?.includes(mainDomain)) {
            longURL = currentURL;
        }
    }

    if (longURL === null) {
        throw new Error(`Unable to find long URL for ${shortenedURL}`);
    }

    return longURL;
}