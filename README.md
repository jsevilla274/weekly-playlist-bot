# weekly-playlist-bot
A script that interacts with Discord's Bot API and Spotify's Web API to retrieve user data from a text channel and compile a Spotify Playlist for the previous week.

## Pre-requisites
* A Discord server
    * Specifically, the `.env` will require the [channel ID](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-) of the channel that will be read/posted to
* A [Discord bot application](https://discord.com/developers/applications)
    * Needs to have the "Send Messages", "Embed Links", and "Read Message History" permissions on the target server
* A [Spotify application](https://developer.spotify.com/dashboard/applications)
    * Make sure to setup the redirect URI to `http://localhost:<SPOTIFY_CALLBACK_PORT>/callback`. See note about `.env` below.

The file `.env.sample` should give you an idea of the credentials/variables that must exist in your `.env` before running the script

## Setup & Running
1. If you have set up your `.env` correctly, all you would need to do is run the script from the local directory
```
$ node index.js
```
2. On first run, you will be prompted to authorize permissions for the script on spotify.com. Authorize the application then close the window when instructed.
3. **(Optional)** Use a job scheduler like cron or Windows Task Scheduler to schedule the script to run weekly.