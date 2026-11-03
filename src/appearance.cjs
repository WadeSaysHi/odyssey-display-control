const fs = require('node:fs/promises');
const path = require('node:path');
const defaults = { theme: 'system', alwaysScrollbars: false, keepInTray: true };
function validate(value) {
  if (!value || !['system', 'light', 'dark'].includes(value.theme) || typeof value.alwaysScrollbars !== 'boolean') throw new Error('Invalid appearance');
  if (value.keepInTray !== undefined && typeof value.keepInTray !== 'boolean') throw new Error('Invalid background preference');
  return { theme: value.theme, alwaysScrollbars: value.alwaysScrollbars, keepInTray: value.keepInTray ?? true };
}
class Appearance {
  constructor(folder) { this.file = path.join(folder, 'appearance.json'); this.value = { ...defaults }; this.writes = Promise.resolve(); }
  async load() { try { this.value = validate(JSON.parse(await fs.readFile(this.file, 'utf8'))); } catch { /* Invalid preferences revert to system appearance. */ } return this.value; }
  set(value) {
    const next = validate(value);
    const write = this.writes.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', JSON.stringify(next)); await fs.rename(this.file + '.tmp', this.file);
      this.value = next; return next;
    });
    this.writes = write.catch(() => {}); return write;
  }
}
module.exports = { Appearance, validate };
