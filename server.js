const http = require('http')
const fs = require('fs')
const server = http.createServer()

server.on('request', (req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.statusCode = 200
    fs.createReadStream(require.resolve('./bundle.js')).pipe(res)
  } else if (req.url === '/worker.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.statusCode = 200
    fs.createReadStream(require.resolve('./worker.js')).pipe(res)
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.statusCode = 200

    res.end('<script src="/bundle.js"></script>')
  }
})

const port = process.env.PORT || 8080

server.listen(port)

console.log(`Server listening on http://localhost:${port}`)
