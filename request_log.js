const crypto = require('node:crypto')
const pino = require('pino')
const pinoHttp = require('pino-http')
const { logger, options } = require('./logger')

//express.static serves the built vue bundle, so without this every page load
//writes a line per js chunk, stylesheet and picture
const STATIC_PREFIXES = ['/assets/', '/ai_pics/']
const STATIC_FILE = /\.(js|mjs|css|map|png|jpe?g|webp|svg|gif|ico|woff2?|ttf)$/i

//originalUrl carries the query string, and /verify-email?token=... is a working
//credential until it is used. only ever keep what comes before the '?'.
function pathOf(req){
  return String(req.originalUrl || req.url || '').split('?')[0]
}

function isStatic(path){
  return STATIC_PREFIXES.some(prefix => path.startsWith(prefix)) || STATIC_FILE.test(path)
}

//the destination argument only exists so the tests can capture output. it has to
//be a whole new instance: logger.child({}, { destination }) is accepted by pino
//and then silently ignored, so the output would still go to stdout.
function buildRequestLog(destination){
  const target = destination ? pino(options, destination) : logger

  const requestLog = pinoHttp({
    logger: target,

    genReqId(req){
      //reuse the platform's id when there is one, so a log line can be matched
      //against the proxy's own record of the request
      return req.headers['x-request-id'] || crypto.randomUUID()
    },

    //returning undefined keeps the raw req and res out of the log entirely.
    //this is what makes the field list an allowlist rather than a denylist:
    //nothing appears unless customProps names it below.
    serializers: { req: () => undefined, res: () => undefined },

    customAttributeKeys: { responseTime: 'durationMs' },

    customProps(req, res){
      return {
        //suppressing the req serializer also discarded pino-http's request id,
        //so it has to be put back by hand
        reqId: req.id,
        method: req.method,
        path: pathOf(req),
        status: res.statusCode,
        //null on lines logged through req.log: pino-http evaluates this once when
        //it builds the child logger, which is before passport sets req.user. the
        //request line below is re-evaluated at finish and does carry the id.
        userId: req.user ? req.user.user_id : null,
        ip: req.ip || null,
        ua: req.headers['user-agent'] || null
      }
    },

    customLogLevel(req, res, err){
      if(err || res.statusCode >= 500){
        return 'error'
      }
      if(res.statusCode >= 400){
        return 'warn'
      }
      return 'info'
    },

    customSuccessMessage: () => 'request',
    customErrorMessage: () => 'request',

    //for any 5xx pino-http invents an Error whose stack points into its own
    //logger.js. keep the request line metadata-only and let the error middleware
    //log the real cause under the same reqId. this also restores durationMs,
    //which pino-http otherwise leaves off the error branch.
    customErrorObject: (req, res, error, val) => ({ durationMs: val.durationMs }),

    autoLogging: {
      ignore: req => isStatic(pathOf(req))
    }
  })

  //req.log is a child built before passport runs, and it lost its request id along
  //with the req serializer. rebinding it here is what makes an in-route error
  //greppable against the request that caused it.
  function attachReqId(req, res, next){
    req.log = req.log.child({ reqId: req.id })
    next()
  }

  return { requestLog, attachReqId }
}

const { requestLog, attachReqId } = buildRequestLog()

module.exports = { requestLog, attachReqId, buildRequestLog, pathOf, isStatic }
