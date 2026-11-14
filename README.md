# Music Bot

Plays YouTube, Spotify and SoundCloud (song name or link) with a Discord V2 player panel.
No API keys needed. The only thing you paste in is your bot token.

## Setup
1. Install Node.js 18 or newer (22 recommended).
2. Open a terminal in this folder and run: `npm install`
3. Open `config.json` and paste your bot token.
4. Run: `npm start`

## Invite
Scopes: `bot` and `applications.commands`. Permissions: View Channels, Send Messages, Connect, Speak.

## Commands
/play <song or link>, /pause, /resume, /skip, /stop, /volume <1-200>, /queue, /panel

## Rules
- Anyone can use /play.
- If the bot is already playing in a VC, /play from a different VC is refused. It never gets moved.
- Panel buttons only work for people in the same VC as the bot.
