/* eslint-disable no-undef */
import * as wpb from '../src/weekly-playlist-bot';

describe('extractSpotifyUrlsAndDiscordUserData(discordMessages)', () => {
    it('should map the discord user ID to username when given a single message', () => {
        // arrange
        let testData = [
            {
              "content": "The mid to ending beat reminds me of an Avalanches song, that was nice https://open.spotify.com/track/1AAYbsAIgEJMbxgLgpjE9y?si=I5fzMJR_TwyrNf69NBwVkw&utm_source=copy-link",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserIdToUsernames } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        expect(discordUserIdToUsernames["559136461311417979"]).toBe('fake_user');
    });

    it('should extract no urls when given a message without urls', () => {
        // arrange
        let testData = [
            {
              "content": "some text here",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        expect(discordUserSpotifyUrls["559136461311417979"].length).toBe(0);
    });

    it('should extract one url without query parameters when given a message with a spotify url', () => {
        // arrange
        let testData = [
            {
              "content": "The mid to ending beat reminds me of an Avalanches song, that was nice https://open.spotify.com/track/1AAYbsAIgEJMbxgLgpjE9y?si=I5fzMJR_TwyrNf69NBwVkw&utm_source=copy-link",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(1);
        expect(testUserUrls[0]).toBe('https://open.spotify.com/track/1AAYbsAIgEJMbxgLgpjE9y');
    });

    it('should extract one urls when given a message with a valid url followed by a newline', () => {
        // arrange
        let testData = [
            {
              "content": "sdfsdfs https://open.spotify.com/track/3hOOeY9W4xhoqscfi9XZof\nsdfg",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(1);
        expect(testUserUrls[0]).toBe('https://open.spotify.com/track/3hOOeY9W4xhoqscfi9XZof');
    });

    it('should extract only one url when given a message with a malformed "joined" url', () => {
        // arrange
        let testData = [
            {
              "content": "lorem ipsum https://open.spotify.com/album/5GZMmsnK1viNAVvxIBB98Ahttps://open.spotify.com/album/0uMXGqXcmmcbQk0g4A0bK7 foo bar",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(1);
        expect(discordUserSpotifyUrls["559136461311417979"][0]).toBe('https://open.spotify.com/album/5GZMmsnK1viNAVvxIBB98Ahttps:/open.spotify.com/album/0uMXGqXcmmcbQk0g4A0bK7');
    });

    it('should extract one url when given a message with multiple valid urls but only one spotify url', () => {
        // arrange
        let testData = [
            {
              "content": "voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque https://developer.spotify.com/documentation/web-api/#spotify-uris-and-ids quasi architecto beatae vitae https://open.spotify.com/album/4gR3h0hcpE1iJH0v5bVv78?si=ChgZZpVrSVOaa2Zi9rcVuA voluptatem. Ut enim ad minima",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(1);
        expect(testUserUrls[0]).toBe('https://open.spotify.com/album/4gR3h0hcpE1iJH0v5bVv78');
    });

    it('should extract three urls when given a message with valid urls (3 spotify urls)', () => {
        // arrange
        let testData = [
            {
              "content": "voluptatem https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5?si=6b7ffe2512d744cd accusantium doloremque laudantium, totam rem aperiam, eaque https://developer.spotify.com/documentation/web-api/#spotify-uris-and-ids quasi architecto beatae vitae https://open.spotify.com/album/4gR3h0hcpE1iJH0v5bVv78?si=ChgZZpVrSVOaa2Zi9rcVuA voluptatem. https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB?si=b4CiVhnqRu6DW8veE3r11w Ut enim ad minima ",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(3);
        expect(testUserUrls.includes('https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5')).toBe(true);
        expect(testUserUrls.includes('https://open.spotify.com/album/4gR3h0hcpE1iJH0v5bVv78')).toBe(true);
        expect(testUserUrls.includes('https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB')).toBe(true);
    });

    it('should extract no urls when given a message from a bot', () => {
        // arrange
        let testData = [
            {
              "content": "some bot text here https://open.spotify.com/track/1WFGJPHAxb64hHsscftYOg?si=13b371c292334636 sd",
              "author": {
                "id": "744977586329047522",
                "username": "fake_bot",
                "bot": true
              }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        expect(Object.keys(discordUserSpotifyUrls).length).toBe(0);
    });

    it('should extract two urls when given two messages from the same user with valid urls', () => {
        // arrange
        let testData = [
            {
              "content": "hello https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB?si=b4CiVhnqRu6DW8veE3r11w Ut enim ad minima ",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            },
            {
                "content": "voluptatem https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5?si=6b7ffe2512d744cd accusantium doloremque laudantium, totam rem aperiam, eaque https://developer.spotify.com/documentation/web-api/#spotify-uris-and-ids quasi architecto beat",
                "author": {
                  "id": "559136461311417979",
                  "username": "fake_user"
                }
            }
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUserUrls = discordUserSpotifyUrls["559136461311417979"];
        expect(testUserUrls.length).toBe(2);
        expect(testUserUrls.includes('https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5')).toBe(true);
        expect(testUserUrls.includes('https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB')).toBe(true);
    });

    it('should extract urls when given messages with valid urls from two different users', () => {
        // arrange
        let testData = [
            {
              "content": "hello https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB?si=b4CiVhnqRu6DW8veE3r11w Ut enim ad minima ",
              "author": {
                "id": "559136461311417979",
                "username": "fake_user"
              }
            },
            {
                "content": "voluptatem https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5?si=6b7ffe2512d744cd accusantium doloremque laudantium, totam rem aperiam, eaque https://developer.spotify.com/documentation/web-api/#spotify-uris-and-ids quasi architecto beat",
                "author": {
                  "id": "559136461311417979",
                  "username": "fake_user"
                }
            },
            {
                "content": "foobar https://open.spotify.com/track/5anCkDvJ17aznvK5TED5uo?si=e9a0ce8de46a4e2d sd",
                "author": {
                  "id": "311417979559136461",
                  "username": "fake_user2"
                }
            },
            {
                "content": "bazqux https://open.spotify.com/track/74Hec0RPD8VWFxMDBKhMcm?si=a1dacaa1211943c0 lorem ipsum dolor amet \n",
                "author": {
                  "id": "311417979559136461",
                  "username": "fake_user2"
                }
            },
        ];

        // act
        const { discordUserSpotifyUrls } = wpb.extractSpotifyUrlsAndDiscordUserData(testData);

        // assert
        let testUser1Urls = discordUserSpotifyUrls["559136461311417979"];
        let testUser2Urls = discordUserSpotifyUrls["311417979559136461"];
        expect(testUser1Urls.length).toBe(2);
        expect(testUser2Urls.length).toBe(2);
        expect(testUser1Urls.includes('https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5')).toBe(true);
        expect(testUser1Urls.includes('https://open.spotify.com/track/0DadJLrbX02CNql5TtNhBB')).toBe(true);
        expect(testUser2Urls.includes('https://open.spotify.com/track/5anCkDvJ17aznvK5TED5uo')).toBe(true);
        expect(testUser2Urls.includes('https://open.spotify.com/track/74Hec0RPD8VWFxMDBKhMcm')).toBe(true);
    });
});

describe('getTrackIdsFromDiscordUserSpotifyUrls(discordUserSpotifyUrls)', () => {
    it('should return a set of track ids for a user given their list of urls (tracks only)', async () => {
        // arrange
        let testData = {
            "559136461311417979": [
                'https://open.spotify.com/track/6e3lmEDl5f9MNjgZjbNVN5',
                'https://open.spotify.com/track/3djWN7th03XZtmF5s3C1Lv',
                'https://open.spotify.com/track/2lN6G35gsXkA3xzPYqmis5'
            ]
        };

        // act
        const userSpotifyTrackIds = await wpb.getTrackIdsFromDiscordUserSpotifyUrls(testData);

        // assert
        let testUserTrackIds = userSpotifyTrackIds["559136461311417979"];
        expect(testUserTrackIds.length).toBe(3);
        expect(testUserTrackIds.includes('6e3lmEDl5f9MNjgZjbNVN5')).toBe(true);
        expect(testUserTrackIds.includes('3djWN7th03XZtmF5s3C1Lv')).toBe(true);
        expect(testUserTrackIds.includes('2lN6G35gsXkA3xzPYqmis5')).toBe(true);
    });

    it('should return a set of track ids for a user given their list of urls (albums only)', async () => {
        // arrange
        let testData = {
            "559136461311417979": [
                'https://open.spotify.com/album/2XLiRCMRy5WuuF373tKBZ8', // 15 tracks
                'https://open.spotify.com/album/3JcfPChvlA4hZl0FEetY77', // 10 tracks
            ]
        };

        // act
        const discordUserSpotifyTrackIds = await wpb.getTrackIdsFromDiscordUserSpotifyUrls(testData);

        // assert
        let testUserTrackIds = discordUserSpotifyTrackIds["559136461311417979"];
        expect(testUserTrackIds.length).toBe(25);
        expect(testUserTrackIds.includes('1QixTwDZCcfBzA7QMyont0')).toBe(true); // from 1st album
        expect(testUserTrackIds.includes('4IEoWpnV0k58TWF5hkta6D')).toBe(true); // from 2nd album
    });

    it('should return a set of track ids for a user given their list of urls (playlists only)', async () => {
        // arrange
        let testData = {
            "559136461311417979": [
                'https://open.spotify.com/playlist/2yz2iS182X2NJc6O7MWJGL', // 19 tracks
                'https://open.spotify.com/playlist/0Wld9L0mxoy0VhmBYm9et2', // 14 tracks
            ]
        };

        // act
        const discordUserSpotifyTrackIds = await wpb.getTrackIdsFromDiscordUserSpotifyUrls(testData);

        // assert
        let testUserTrackIds = discordUserSpotifyTrackIds["559136461311417979"];
        expect(testUserTrackIds.length).toBe(33);
        expect(testUserTrackIds.includes('4uLU6hMCjMI75M1A2tKUQC')).toBe(true); // from 1st playlist
        expect(testUserTrackIds.includes('7zAt4tdL44D3VuzsvM0N8n')).toBe(true); // from 2nd playlist
    });
});

// describe('[unit of work]', () => {
//     it('should [expected behaviour] when [scenario/context]', () => {});
// });

// describe('[unit of work]', () => {
//     describe('when [scenario/context]', () => {
//         it('should [expected behaviour]', () => {});
//     });
// });