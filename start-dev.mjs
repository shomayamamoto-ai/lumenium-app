import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const { createServer } = await import('vite');

const server = await createServer({
  configFile: __dirname + '/vite.config.js',
  root: __dirname,
  server: {
    port: 5180,
    host: true,
  },
});

await server.listen();
server.printUrls();
