# weekly-playlist-bot
A script that interacts with Discord's Bot API and Spotify's Web API to retrieve user data from a text channel and compile a Spotify Playlist for the previous week.

## Pre-requisites
* `.env` file
    * Please use `.env.sample` as a basis and see other pre-requisites to understand how to populate it
* Discord server
    * The `.env` file will require the [channel ID](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-) of the channel that will be read/posted to
* [Discord bot application](https://discord.com/developers/applications)
    * A bot token will need to be supplied in the `.env`
    * The bot will need to be invited into the target server and have the "Send Messages", "Embed Links", "Manage Messages", and "Read Message History" permissions
* [Spotify application](https://developer.spotify.com/dashboard/applications)
    * Make sure to setup the redirect URI to `http://localhost:<SPOTIFY_CALLBACK_PORT>/callback`. It should be the same port specified in `.env`
    * The application's client secret and client id will have to be supplied in `.env`


## Setup & Running
1. Navigate to the location you cloned this repository install dependencies
```
$ npm install
```
2. Run the application
```
$ node index.js
```
* You will be prompted to authorize permissions for the script on spotify.com. Authorize the application then close the window when instructed
3. **(Optional)** Use a job scheduler like cron or Windows Task Scheduler to schedule the script to run weekly