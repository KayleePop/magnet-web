# Magnet Web

https://kayleepop.github.io/magnet-web/

View webtorrents like they're an http directory using a service worker. Easily view webtorrents in browser, and even load websites over webtorrent.

## How To Run

``` bash
$ npm install
$ npm start
```

## About

Magnet web uses [Stream-to-SW](https://github.com/KayleePop/stream-to-sw) to register a service worker on the main thread, then it loads the actual file from the webtorrent into an iframe. Since Stream-to-SW pings all clients in scope, the main thread can process the requests that are loaded into the iframe.

Magnet web creates a file directory browser for all multi-file torrents, but if an index.html file is in a directory, then that will be loaded instead, which allows a static website to be hosted with webtorrent/webRTC.

The URL scheme is `/{webtorrent Info Hash}/path` where the path is to a file within the torrent (using the torrent's directory structure).

## TODO

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
