const app = require('../../../backend_server');

// 把 Netlify event 格式转成 Express 能理解的 (req, res)，然后手动转响应回去
// 不需要 serverless-http 或 @netlify/functions 任何第三方依赖

function buildRequest(event) {
  const headers = event.headers || {};
  const qs = event.queryStringParameters ? Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  const path = event.rawPath || event.path || '/';
  const url = qs ? `${path}?${qs}` : path;
  return {
    method: event.httpMethod || 'GET',
    url,
    headers,
    _readableState: null,
    body: event.body,
    isBase64Encoded: event.isBase64Encoded || false,
  };
}

function sendResponse() {
  // Promise-based 响应收束器：把 Express 所有 res.write / res.end 收集成一个 lambda 返回对象
  let resolvePromise;
  const p = new Promise(r => { resolvePromise = r; });
  let status = 200;
  const headers = {};
  const chunks = [];
  let finished = false;

  const res = {
    statusCode: 200,
    setHeader(k, v) { headers[k.toLowerCase()] = String(v); return this; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    getHeaders() { return headers; },
    hasHeader(k) { return k.toLowerCase() in headers; },
    removeHeader(k) { delete headers[k.toLowerCase()]; },
    status(code) { status = code; return this; },
    writeHead(code, hdrs) {
      status = code;
      if (hdrs) for (const [k,v] of Object.entries(hdrs)) this.setHeader(k,v);
      return this;
    },
    write(chunk) {
      if (chunk == null) return true;
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk != null) this.write(chunk);
      if (finished) return;
      finished = true;
      const bodyBuf = Buffer.concat(chunks);
      const ct = headers['content-type'] || '';
      const isBase64 = !ct.startsWith('text/') && !ct.startsWith('application/json') && !ct.startsWith('application/javascript') && !ct.startsWith('application/xml');
      resolvePromise({
        statusCode: status,
        headers,
        body: isBase64 ? bodyBuf.toString('base64') : bodyBuf.toString('utf-8'),
        isBase64,
      });
    },
    json(obj) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(obj));
    },
    send(data) {
      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        return this.json(data);
      }
      this.end(data);
    },
    on() { /* noop */ },
    once() { /* noop */ },
    endEarly() { this.end(); },
  };
  return { res, promise: p };
}

exports.handler = async (event, context) => {
  // 允许调用函数时直接通过 /api/* 或 /.netlify/functions/api/* 访问
  // 统一成后端内部识别的 /api 路径
  let normalizedPath = event.path || '';
  if (normalizedPath.startsWith('/.netlify/functions/api')) {
    normalizedPath = normalizedPath.replace('/.netlify/functions/api', '/api');
  }
  if (!normalizedPath.startsWith('/api')) {
    normalizedPath = '/api' + (normalizedPath.startsWith('/') ? '' : '/') + normalizedPath;
  }
  const patchedEvent = { ...event, path: normalizedPath };

  const req = buildRequest(patchedEvent);
  const { res, promise } = sendResponse();

  // body 注入
  let bodyBuf = Buffer.alloc(0);
  if (event.body) {
    bodyBuf = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf-8');
  }

  // Express 需要一个兼容的 (req,res) 对象
  // 我们用一个最小实现，把 body 作为可读 stream 推送 + 调用 app
  const expressReq = {
    method: req.method,
    url: req.url,
    path: (new URL(req.url, 'http://x')).pathname,
    originalUrl: req.url,
    headers: req.headers,
    query: event.queryStringParameters || {},
    params: {},
    body: null,
    _readableState: null,
    // express middleware 使用 body 字符串；需要时会挂 raw body
    _rawBody: bodyBuf,
    // 简易 read 兼容：bodyParser.json() 会调用 setEncoding / on('data') / on('end') / pipe
    _events: {},
    on(ev, cb) { this._events[ev] = cb; return this; },
    emit(ev, data) { if (this._events[ev]) this._events[ev](data); return true; },
    pipe() { return this; },
    read() { return null; },
    resume() { return this; },
    setEncoding() { return this; },
  };

  // 如果请求是 application/json，直接把 raw body 挂到 expressReq.body（已解析后的对象）
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json') && bodyBuf.length) {
    try {
      expressReq.body = JSON.parse(bodyBuf.toString('utf-8'));
    } catch (_) {
      expressReq.body = {};
    }
  } else if (ct.includes('application/x-www-form-urlencoded') && bodyBuf.length) {
    expressReq.body = Object.fromEntries(new URLSearchParams(bodyBuf.toString('utf-8')));
  } else {
    expressReq.body = {};
  }

  try {
    app(expressReq, res);
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, error: err.message || String(err) });
  }

  // 超时保护（Netlify 免费上限 10s，这里 9.5s 必须返回）
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Netlify Function 9.5s timeout')), 9500));
  return Promise.race([promise, timeout.catch(err => ({
    statusCode: 504,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: err.message })
  }))]);
};
