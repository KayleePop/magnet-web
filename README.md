# Magnet Web

https://kayleepop.github.io/magnet-web/

View webtorrents like they're an http directory using a service worker. Easily view webtorrents in browser, and even load websites over webtorrent.

It's also hosted on glitch: https://glitch.com/~kayleepop-magnet-web

## How To Run

``` bash
$ npm install
$ npm start
```

## Embed

Magnet-web can be embedded into your site for super easy access to a file inside a webtorrent.

Here we load the Sintel webtorrent into the page.
``` html
<iframe src="https://kayleepop.github.io/magnet-web/08ada5a7a6183aae1e09d831df6748d566095a10/Sintel.mp4"></iframe>
```

Unfortunately, only iframes will work. You cannot use this link in other places like directly into a video element. This could be accomplished with the same technique as magnet-web though, using [Stream-to-SW](https://github.com/KayleePop/stream-to-sw).

## About

Magnet web uses [Stream-to-SW](https://github.com/KayleePop/stream-to-sw) to register a service worker on the main thread, then it loads the actual file from the webtorrent into an iframe. Since Stream-to-SW pings all clients in scope, the main thread can process the requests that are loaded into the iframe.

Magnet web creates a file directory browser for all multi-file torrents, but if an index.html file is in a directory, then that will be loaded instead, which allows a static website to be hosted with webtorrent/webRTC.

The URL scheme is `/{webtorrent Info Hash}/path` where the path is to a file within the torrent (using the torrent's directory structure).

## TODO

PRs are welcome for these and any other ideas.

- Prettier homepage
- Prettier directory view
- Allow loading webseeds and xs via query param?
- interface for hosting a static website via webtorrent
  - Drag and Drop the site's files (like instant.io)
  - make sure folders work correctly (instant.io seems to only allow a flat directory)
  - "leave this page open to allow others to load your site"
  - link to try it out (opens in new tab)
  - explanation of what a static website is
- Cache torrents maybe?
  - cache .torrent file in IDB (to allow seeding without any other peers)
  - cache torrent data in IDB ([idbkv-chunk-store](https://github.com/KayleePop/idbkv-chunk-store))
  - interface for managing (deleting) stored data from IDB
