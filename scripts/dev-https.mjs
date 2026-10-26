import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import selfsigned from 'selfsigned';

/**
 * A development-only HTTPS companion for WebXR headsets. The ordinary Next HTTP
 * server remains available for desktop localhost and adb reverse; this proxy
 * forwards both page requests and HMR WebSockets without a second Next instance.
 */
export async function startQuestHttps({ port, httpsPort, lanHosts }) {
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: '::1' },
    ...lanHosts.map(ip => ({ type: 7, ip })),
  ];
  const certificate = await selfsigned.generate([{ name: 'commonName', value: 'BoltXR local development' }], {
    days: 365,
    keySize: 2048,
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  const proxy = (req, res) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, 'x-forwarded-proto': 'https' },
    }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('BoltXR is still starting. Refresh in a moment.');
    });
    req.pipe(upstream);
  };

  const server = https.createServer({ key: certificate.private, cert: certificate.cert }, proxy);
  server.on('upgrade', (req, client, head) => {
    const upstream = net.connect(port, '127.0.0.1', () => {
      const headers = Object.entries({ ...req.headers, 'x-forwarded-proto': 'https' })
        .map(([name, value]) => `${name}: ${value}`).join('\r\n');
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    upstream.once('data', chunk => console.log('[DEBUG-quest-hmr]', JSON.stringify(chunk.toString('utf8', 0, 240))));
    upstream.on('error', error => { console.log('[DEBUG-quest-hmr] upstream', error.message); client.destroy(); });
    client.on('error', error => { console.log('[DEBUG-quest-hmr] client', error.message); upstream.destroy(); });
  });
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(httpsPort, '0.0.0.0', resolve);
  });
  return server;
}
