// parse HTTP range headers
const parseRange = require('range-parser')

const WebTorrent = require('webtorrent')
const webtorrentClient = new WebTorrent()

const registerStreamToFetch = require('stream-to-sw')

const readyPromise = registerStreamToFetch('/worker.js', async (req, res) => {
  // torrent file names with spaces or other characters get encoded
  const torrentPath = decodeURI(req.path)

  // format of intercepted URLs is /magnet/${hashId}/path
  const urlParts = torrentPath.split('/')
  const hashId = urlParts[2]
  const filePath = urlParts.slice(3).join('/')

  const torrent = await new Promise((resolve, reject) => {
    // these are the default trackers used by instant.io and webtorrent desktop
    const torrentOpts = {
      announce: [
        'wss://tracker.btorrent.xyz',
        'wss://tracker.fastcast.nz',
        'wss://tracker.openwebtorrent.com'
      ]
    }

    // add torrent to client or use existing
    const torrent = webtorrentClient.get(hashId) || webtorrentClient.add(hashId, torrentOpts)

    // wait for metadata to be available for matching files to path
    if (torrent.metadata) {
      resolve(torrent)
    } else {
      torrent.once('metadata', () => resolve(torrent))
    }
  })

  // all files that are under the path
  const matchedFiles = torrent.files.filter(file => {
    // root should match all files
    if (filePath === '') {
      return true
    }

    // trim torrent name and initial slash
    const currFilePath = file.path.replace(/^.+?\//, '')

    return currFilePath.startsWith(filePath)
  })

  // look for an index.html in the directory
  const htmlIndex = matchedFiles.find(file => {
    return file.path.endsWith(filePath + '/index.html')
  })

  // if the specified path has an index.html file, then redirect to that
  if (htmlIndex) {
    res.status = 301
    res.headers.location = `${torrentPath}/index.html`

    return
  }

  if (matchedFiles.length === 0) {
    res.status = 404
    res.headers['content-type'] = 'text/html'

    return 'path not found in torrent'
  }

  // if the path is a directory, display a listing of it
  if (matchedFiles.length > 1) {
    res.headers['content-type'] = 'text/html'

    const fileListHTML = `
      <h1>${torrent.name}/${filePath}</h1>

      <table>
        ${
          matchedFiles.map(file => {
            // trim torrent name and initial slash
            const trimmedFilePath = file.path.replace(/^.+?\//, '')

            const fileHref = `${torrent.infoHash}/${trimmedFilePath}`

            return `<tr>
                <td>
                  <a href="/magnet/${fileHref}">
                    ${trimmedFilePath}
                  </a>
                </td>
              </tr>`
          }).join('\n')
        }
      </table>`

    // a normal array counts as an asynciterator
    return fileListHTML
  }

  // else respond with first matched file (should be the only file)
  return getFileStream(matchedFiles[0])

  // respond to request with stream of webtorrent file
  function getFileStream (file) {
    res.headers['content-type'] = file._getMimeType() // the mime type of the file
    res.headers['accept-ranges'] = 'bytes' // range headers are supported

    let range
    if (req.headers.range) {
      range = parseRange(file.length, req.headers.range)
    }

    // if the range is an array, then a valid range was requested
    if (Array.isArray(range)) {
      res.status = 206 // successful range request
      res.statusText = 'Partial Content'

      // only respond with the first range specified
      // otherwise multiple streams would be needed, and it gets too complicated
      range = range[0]

      // range description
      res.headers['content-range'] = `bytes ${range.start}-${range.end}/${file.length}`
      // length of response, +1 because both start and end are inclusive
      res.headers['content-length'] = range.end - range.start + 1
    } else {
      // if no range (or an invalid range) was requested, then respond with the entire file

      range = null
      res.headers['content-length'] = file.length // length of response
    }

    if (req.method === 'HEAD') return // return an empty body

    // file.createReadStream() is documented here: https://webtorrent.io/docs
    // it returns a node stream, which is an asyncIterator
    return file.createReadStream(range)
  }
})

main()
async function main () {
  // wait until the DOM is available
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      window.addEventListener('DOMContentLoaded', resolve, { once: true })
    })
  }

  // if url doesn't match /${hashId}/*
  if (!/^\/[a-zA-Z0-9]{40}(\/.*)?$/.test(window.location.pathname)) {
    document.body.innerHTML += `
      <div id="hashFormDiv">
        <span style="font-size:3em">Magnet Web</span>
      <form id="hashForm" onsubmit="return false">
        <label>
          Magnet Link or InfoHash:
          <input id="infoHashInput"
            autofocus
            type="text"
            pattern=".*[a-zA-Z0-9]{40}.*"
          >
        </label>
          </br>
        <button type="submit">View Torrent</button>
      </form>

        <div id="links">
          <a href="/08ada5a7a6183aae1e09d831df6748d566095a10">
            Sintel Torrent
      </a>
          <a href="/a88fda5954e89178c372716a6a78b8180ed4dad3">
            Wired CD
          </a>
          <a href="https://github.com/KayleePop/magnet-web">
            magnet-web github repository
          </a>
        </div>
      </div>
      <style>
        #hashFormDiv, #hashForm, #links {
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
        }

        #hashFormDiv {
          height: 100%;
          justify-content: space-evenly;
        }
      </style>
    `
    document.getElementById('hashForm').addEventListener('submit', () => {
      const input = document.getElementById('infoHashInput').value
      const hashId = input.match(/[a-zA-Z0-9]{40}/)[0]
      window.location.href = `/${hashId}`
    }, { once: true })
  } else {
    // else if url doesn't match /{hashId}/*

    // display loading indicator while SW gets ready and torrent is fetched
    document.body.innerHTML += `
      <div id="loading">
        loading

        <style>
          #loading {
            font-size: 3em;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          #loading:after {
            animation: dots steps(1,end) 3s infinite;
            content: '';
          }
          @keyframes dots {
            25%  { content: '.'; }
            50%  { content: '..'; }
            75%  { content: '...'; }
          }
        </style>
      </div>`

    // wait until the SW is ready before creating Iframe
    await readyPromise

    // load the torrent file in a borderless iframe, so that the SW can intercept everything
    // while the main thread does the above processing
    // it would be better to run webtorrent directly from the service worker,
    //  but webRTC connections can't be started from workers (yet)
    // use onLoad to sync the URL of the iframe and the main page
    document.body.innerHTML += `
      <iframe
        id="frame"
        src="${'/magnet' + window.location.pathname}"
        onLoad="parent.history.replaceState(null, null, this.contentWindow.location.href.replace('/magnet',''))"
        ></iframe>

      <style>
        body {
          margin: 0px;
          width: 100%;
          height: 100%;
        }

        iframe {
          border: none;
          width: 100%;
          height: 100%;
        }
      </style>`

    document.getElementById('frame').addEventListener('load', () => {
      document.getElementById('loading').remove()
    }, { once: true })
  }

  // if an error occurs, display it at the top of the screen
  webtorrentClient.once('error', (error) => {
    document.body.innerHTML = `
      <code style="color: red">${error}</code>
      ${document.body.innerHTML}`
  })
}