import https from 'node:https';
import httpProxy from 'http-proxy';
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
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${port}`,
    ws: true,
    xfwd: true,
  });
  const server = https.createServer({ key: certificate.private, cert: certificate.cert }, (req, res) => {
    proxy.web(req, res, () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('BoltXR is still starting. Refresh in a moment.');
    });
  });
  server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head, () => socket.destroy());
  });
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(httpsPort, '0.0.0.0', resolve);
  });
  return server;
}
