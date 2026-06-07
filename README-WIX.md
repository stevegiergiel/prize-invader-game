# Prize Invader v4 — Wix Installation Notes

This version includes a Full Screen button and two leaderboard options.

## Option A — Easiest: embed the game as-is

This stores scores permanently in the visitor's own browser using localStorage. It is permanent for that browser/device, but not shared between visitors.

Steps:
1. Upload the unzipped game files to normal web hosting, for example a subdomain, GitHub Pages, Netlify, or your own web space.
2. In Wix, add **Embed Code → Embed a Site**.
3. Paste the URL to your hosted `index.html`.
4. In the Wix embed settings, allow interaction and make the frame large, ideally 1000px+ wide.

Important: Wix normally embeds this as an iframe. The browser will only allow full screen if the iframe has the `allowfullscreen` permission. Wix's **Embed a Site** element usually handles this better than raw HTML embed code.

## Option B — Shared Wix leaderboard using Velo/Wix Data

Use this if you want one shared leaderboard across all visitors.

### 1. Turn on Velo
In Wix Editor:
- Dev Mode / Velo: ON.

### 2. Create a database collection
Create a collection called:

`PrizeInvaderScores`

Recommended fields:
- `name` — Text
- `score` — Number
- `level` — Number
- `when` — Date and Time

Permissions:
- Read: Anyone
- Create: Anyone
- Update/Delete: Admin only

### 3. Add an HTML iframe component
Add **Embed Code → Custom Embeds → HTML iframe**.
Set its element ID to:

`htmlPrizeInvader`

Paste this iframe HTML, changing the `src` to wherever you host the game:

```html
<iframe
  src="https://YOUR-GAME-HOST/index.html?leaderboard=wix"
  style="width:100%;height:760px;border:0;"
  allow="fullscreen"
  allowfullscreen>
</iframe>
```

### 4. Add the Wix page code
Copy the contents of `wix-page-code.js` into the page code panel in Wix.

This listens for the game asking for scores and writes qualifying scores back to the Wix database.

## Hosting note
The game is static HTML/CSS/JS. Wix is not ideal for uploading a whole folder of static game files directly unless you use an HTML iframe or host the files elsewhere and embed them.

## v5 arcade bonus visitors

This version randomises the top-row bonus target. It can appear as:
- the original-style saucer,
- an original yellow chomping-orb character,
- an original blue shy-spirit character.

These are deliberately generic arcade-inspired sprites. They are not named after, copied from, or intended to reproduce any copyrighted third-party game character.


## v6 additions

This version adds four original arcade-inspired phantom visitors: Crimson Phantom, Rose Spectre, Azure Wisp and Amber Shade. They are not Pac-Man ghosts or copied game characters; they are original bonus targets with different colours, movement styles and centre-hit values.

It also adds generated in-browser sound effects for firing, hits, shelter damage, bonus visitors, explosions, level starts, bonus invasion waves and leaderboard entry. No external audio files are required. Use the Sound On / Sound Off button to mute or re-enable audio.


V7 note: Wix primary player name field should use field ID `title`. The updated wix-page-code.js writes to `title` and game.js now displays level plus date/time on leaderboard rows.
