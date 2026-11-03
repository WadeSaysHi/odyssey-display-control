import { packager } from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const platform = args.find(x => x.startsWith('--platform='))?.split('=')[1] || process.platform;
const arch = args.find(x => x.startsWith('--arch='))?.split('=')[1] || process.arch;
if (!['darwin', 'win32'].includes(platform)) throw Error('Supported platforms: darwin, win32');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
const stage = path.join(root, '.local', `stage-${platform}-${arch}`);
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
for (const name of ['src', 'ui', 'native', 'LICENSE']) await fs.cp(path.join(root, name), path.join(stage, name), { recursive: true });
await fs.mkdir(path.join(stage, 'node_modules'), { recursive: true });
await fs.cp(path.join(root, 'node_modules/ws'), path.join(stage, 'node_modules/ws'), { recursive: true });
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main, license: pkg.license, author: pkg.author, description: pkg.description }));
const localZip = path.join(root, '.local', `electron-v${pkg.devDependencies.electron}-${platform}-${arch}.zip`);
const hasLocalZip = await fs.access(localZip).then(() => true, () => false);
const results = await packager({ dir: stage, out: path.join(root, 'dist'),
  name: pkg.productName, executableName: 'OdysseyController',
  appBundleId: 'io.github.wadesayshi.odyssey-controller', appCategoryType: 'public.app-category.utilities',
  appVersion: pkg.version, platform, arch, electronVersion: pkg.devDependencies.electron,
  ...(hasLocalZip ? { electronZipDir: path.dirname(localZip) } : {}),
  icon: path.join(root, 'assets', platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
  asar: { unpackDir: 'native' }, prune: false, overwrite: true, osxSign: false, osxNotarize: false,
});
if (args.includes('--zip')) {
  const name = `odyssey-display-control-${pkg.version}-${platform}-${arch}.zip`;
  const output = path.join(root, 'dist', name);
  await fs.rm(output, { force: true });
  if (process.platform === 'win32') {
    // Paths come only from this build script and package version, not external data.
    const q = value => "'" + value.replaceAll("'", "''") + "'";
    const command = `Compress-Archive -Path ${q(path.join(results[0], '*'))} -DestinationPath ${q(output)}`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
  } else if (platform === 'darwin') {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.join(results[0], pkg.productName + '.app'), output]);
  } else execFileSync('zip', ['-q', '-r', output, '.'], { cwd: results[0] });
  console.log(output);
} else console.log(results.join('\n'));
