// parse HTTP range headers
const parseRange = require('range-parser')

const WebTorrent = require('webtorrent')
const webtorrentClient = new WebTorrent()

const registerStreamToFetch = require('stream-to-sw')

// if the magnet-web app is inside a directory instead of the html root,
//  use this to set all the urls to that directory
const appDir = ''

const swReadyPromise = registerStreamToFetch(`${appDir}/worker.js`, async (req, res) => {
  // torrent file names with spaces or other characters get encoded
  const torrentPath = decodeURI(req.path)

  // format of intercepted URLs is /magnet/${hashId}/path
  const matched = /([a-zA-Z0-9]{40})\/?(.*)/.exec(torrentPath)
  const hashId = matched[1]
  const filePath = matched[2] || ''

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
                  <a href="${appDir}/magnet/${fileHref}">
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
    await new Promise((resolve) => {
      window.addEventListener('DOMContentLoaded', resolve, { once: true })
    })
  }

  const path = window.location.pathname.replace(appDir, '')
  // /${hashId}/*
  const isTorrentPath = /^\/[a-zA-Z0-9]{40}(\/.*)?$/.test(path)

  // display functions hoisted from below
  if (isTorrentPath) {
    displayTorrentPage()
  } else {
    // reset url to home if it doesn't match any routes
    window.history.replaceState(null, null, `${appDir}`)
    displayHomepage()
  }

  // if a webtorrent client error (fatal) occurs, display it at the top of the screen
  webtorrentClient.once('error', (error) => {
    document.body.innerHTML = `
      <code style="color: red">${error}</code>
      ${document.body.innerHTML}`
  })

  async function displayTorrentPage () {
    displayLoadingIndicator()

    // iframe needs to be intercepted by service worker
    await swReadyPromise

    displayTorrentFrame()

    const torrentFrame = document.getElementById('torrentFrame')
    const iframe = document.querySelector('#torrentFrame iframe')

    // hide frame until it's loaded and loading indicator is gone
    torrentFrame.style.display = 'none'

    iframe.addEventListener('load', () => {
      document.getElementById('loadingIndicator').remove()
      torrentFrame.style.display = ''
    }, { once: true })

    // sync href of iframe and main page
    // should be the same but without the /magnet prefix
    const updateUrl = () => {
      // calling replaceState with protocol and hostname (https://host.com) throws security error
      const iframePath = iframe.contentWindow.location.href.replace(window.origin, '')
      window.history.replaceState(null, null, iframePath.replace('/magnet/', '/'))
    }
    // If updateUrl() was simply called on 'load', then the url isn't updated until after loading finishes
    iframe.addEventListener('load', () => {
      //  unload handlers are removed on new page load
      iframe.contentWindow.addEventListener('unload', () => {
        //  new href is set one tick after unload finishes
        setTimeout(updateUrl, 0)
      })
    })
    iframe.contentWindow.addEventListener('hashchange', updateUrl) // when hash changes
    iframe.contentWindow.addEventListener('popstate', updateUrl) // when history API is used
  }

  function displayHomepage () {
    document.body.innerHTML += `
      <div id="homepage">
        <span style="font-size:3em">Magnet Web</span>
        <form id="hashForm" onsubmit="return false"> <!-- pevent default submission -->
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
          <a href="${appDir}/08ada5a7a6183aae1e09d831df6748d566095a10">
            Sintel Torrent
          </a>
          <a href="${appDir}/a88fda5954e89178c372716a6a78b8180ed4dad3">
            Wired CD
          </a>
          <a href="https://github.com/KayleePop/magnet-web">
            magnet-web github repository
          </a>
        </div>
        <style>
          #homepage {
            height: 100%;
          }

          #homepage, #hashForm, #links {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-evenly;
          }
        </style>
      </div>
    `

    // when fom is submitted, go to ${appDir}/${input.value}
    document.getElementById('hashForm').addEventListener('submit', () => {
      const input = document.getElementById('infoHashInput')
      const hashId = input.value.match(/[a-zA-Z0-9]{40}/)[0]
      window.location.href = `${appDir}/${hashId}`
    }, { once: true })
  }

  function displayLoadingIndicator () {
    document.body.innerHTML += `
      <div id="loadingIndicator">
        loading

        <style>
          #loadingIndicator {
            font-size: 3em;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          #loadingIndicator:after {
            animation: dots 3s infinite;
            content: '';
          }
          @keyframes dots {
            25%  { content: '.'; }
            50%  { content: '..'; }
            75%  { content: '...'; }
          }
        </style>
      </div>`
  }

  // load the torrent file in a borderless iframe, so that the SW can intercept everything
  //  while the main thread is available to create the stream for the response
  // it would be better to run webtorrent directly from the service worker,
  //  but webRTC connections can't be started from workers (yet)
  function displayTorrentFrame () {
    // /{hashid}/* including query params and hash
    const torrentPath = window.location.href.replace(`${window.origin}${appDir}`, '')

    document.body.innerHTML += `
      <span id="torrentFrame">
        <iframe src="${`${appDir}/magnet${torrentPath}`}"></iframe>

        <style>
          body {
            margin: 0px;
            width: 100%;
            height: 100%;
          }

          #torrentFrame iframe {
            border: none;
            width: 100%;
            height: 100%;
          }
        </style>
      </span>`
  }
}
