/* eslint-env serviceworker */

// returns an id that hasn't been used before by this thread
let numIds = 0
function generateUniqueId () {
  numIds++
  return numIds
}

async function nextPostMessage () {
  return new Promise((resolve) => {
    self.addEventListener(
      'message',
      e => resolve(e.data),
      { once: true }
    )
  })
}

// resolve with next postMessage that matches a condition (given by closure)
// if no closure is passed, resolves with the next post message
// TODO: does this infinite loop cause a performance problem or memory leak?
async function nextMessage (boolClosure = () => true) {
  while (true) {
    const message = await nextPostMessage()

    if (boolClosure(message)) {
      return message
    }
  }
}

self.addEventListener('fetch', (e) => {
  const request = e.request

  // this function is set with the cli
  const shouldIntercept =
  // CLI REPLACE START
(path) => path.startsWith('/magnet-web/magnet/')
  // CLI REPLACE END

  let path = request.url.replace(self.origin, '') // trim protocol and host
  path = path.replace(/#.*$/, '') // trim hash
  path = path.replace(/\?.*$/, '') // trim query params
  path = path.replace(/\/$/, '') // trim trailing slash if present

  if (!shouldIntercept(path, request)) {
    return // let request be handled by normal fetch
  }

  e.respondWith(getResponse())

  async function getResponse () {
    // get the first client that responds to a ping
    async function getClient () {
      // ping the client to see if it can receive and send postmessages
      async function ping (client) {
        // use a unique id to differentiate messages corresponding to different pings
        // each request makes a ping to all windows
        const pingId = generateUniqueId()

        client.postMessage({
          type: 'ping',
          id: pingId
        })

        // TODO: does this cause a leak? for windows closed during a ping?
        await nextMessage(message => message.type === 'pong' && message.id === pingId)

        return client
      }

      // TODO: should the request timeout if no window responds?
      //       right now requests wait until registerStreamToSw() is called

      // wait until a window responds to a ping to ensure that
      // the request can be processed by the thread and responded to using postmessage
      while (true) {
        const clients = await self.clients.matchAll({ type: 'window' })

        // wait until there are actually windows to ping
        if (!clients || clients.length === 0) {
          continue
        }

        // postMessage latency is less than a millisecond https://hacks.mozilla.org/2015/07/how-fast-are-web-workers/
        const PING_TIMEOUT = 5

        const client = await Promise.race([
          ...clients.map(client => ping(client)),
          new Promise(resolve => setTimeout(() => resolve(false), PING_TIMEOUT))
        ])

        // false if timed out
        if (client) {
          return client
        }
      }
    }

    const client = await getClient()

    // use a unique ID to differentiate postMessages coorresponding to different requests
    const responseId = generateUniqueId()

    function sendMessageToWindow (obj) {
      obj.id = responseId
      client.postMessage(obj)
    }

    // request objects can't be sent via postMessage, so construct an object literal representation
    const props = [
      'method',
      'mode',
      'url',
      'credentials',
      'cache',
      'context',
      'destination',
      'redirect',
      'integrity',
      'referrer',
      'referrerPolicy',
      'keepalive',
      'isHistoryNavigation'
    ]
    const plainRequest = {}
    for (const key of props) {
      plainRequest[key] = request[key]
    }

    plainRequest.headers = {}
    // convert headers object into plain associative array
    for (const [key, value] of request.headers) {
      plainRequest.headers[key] = value
    }

    // send body as blob, which minimizes postMessage overhead (only a pointer to data will be sent)
    plainRequest.body = await request.blob()

    // include trimmed path
    plainRequest.path = path

    // send request data to window
    // this is the req object in registerStreamToSw('/worker.js', (req, res) => {})
    sendMessageToWindow({
      type: 'request',
      plainRequest
    })

    // the first message sent for a response is always metadata
    const metadata = await nextMessage(message => message.id === responseId)

    const responseStream = new self.ReadableStream({
      async pull (controller) {
        sendMessageToWindow({ type: 'pull' })

        // after metadata is sent, post messages will only be either chunks or 'done'
        const message = await nextMessage(message => message.id === responseId)

        if (message.type === 'done') {
          controller.close()
        } else {
          controller.enqueue(message.chunk)
        }
      },
      cancel () {
        sendMessageToWindow({ type: 'cancel' })
      }
    })

    return new self.Response(
      responseStream,
      {
        status: metadata.status,
        headers: metadata.headers,
        statusText: metadata.statusText
      }
    )
  }
})

// activate the service worker immediately instead of waiting until the next reload
self.addEventListener('install', (event) => self.skipWaiting())
self.addEventListener('activate', (event) => self.clients.claim())
