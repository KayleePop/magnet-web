# Magnet Web

https://kayleepop.github.io/magnet-web/

View webtorrents like they're an http server using a service worker. Easily browse the files in a torrent in browser, and even load static websites over webtorrent. Just include an `index.html` file in the torrent's root.

## How To Run

``` bash
$ npm install
$ npm start
```

## Embed

Magnet-web can be embedded into your site for super easy access to a specific file inside a webtorrent.
This will load the Sintel.mp4 movie into the page. [demo link](https://flems.io/#0=N4IgzgpgNhDGAuEAmIBcIB0ALeBbKIANCAGYCWMYaA2qAHYCGuEamO+RIsA9nYn6wA8ZEgCcmEAARhRsALwAdEDngAHMKgD0mgNYMAnjAiruqjAHMy8LAFcARhjLdNuBuboR4AWgDuEO5oADAAcDEgMAKwMAOwMAGwAjMEAzAwMEAkQgQCcSCkJSCRx0QAswUgRcXE5UQmBmgDKZHzQGLiqJUoAfIKaIuLMXZyQMAhOdFTogagJCSUgAL4AugtAA)
``` html
<iframe src="https://kayleepop.github.io/magnet-web/08ada5a7a6183aae1e09d831df6748d566095a10/Sintel.mp4"></iframe>
```

Unfortunately, only iframes will work. You cannot use this link in other places like directly into a video element because magnet-web requires two pages to work (one to run webtorrent, and one to load requests from the SW). You could accomplish this using [Stream-to-SW](https://github.com/KayleePop/stream-to-sw) directly however.

## About

Magnet web creates a file directory browser for multi-file torrents, but if an index.html file is in a directory, then that webpage will be loaded instead, which allows a static website to be hosted with webtorrent/webRTC.

The URL scheme is `/{webtorrent Info Hash}/path` where the path is to a file within the torrent (using the torrent's directory structure).

[Stream-to-SW](https://github.com/KayleePop/stream-to-sw) is used to register a service worker that responds to requests using a stream from the main thread. It runs webtorrent on the main page, then it loads the actual file from the torrent into an iframe. This allows webtorrent to stay running even when loading different pages/files from the service worker which would normally stop all javascript if it was all in one window.

A custom chunk store is used to ensure that a maximum of 100mb of data is loaded into memory. In addition, only chunks requested by the service worker's streams are downloaded and seeded to peers.

## Metastream

Magnet-web works with [metastream](https://getmetastream.com/) to watch videos within torrents with friends!

## TODO

PRs are welcome for these and any other ideas.

- Prettier homepage
- Prettier directory view
- Allow loading webseeds via query param? (xs too?)
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
