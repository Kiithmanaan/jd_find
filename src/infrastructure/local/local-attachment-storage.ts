import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import type { AttachmentStorage } from "../../application/ports.js";

export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async save(searchRunId: string, candidateId: string, filename: string, content: Buffer): Promise<string> {
    const directory = this.inside(searchRunId);
    await mkdir(directory, { recursive: true });
    const key = join(searchRunId, `${candidateId}-${basename(filename)}`);
    await writeFile(this.inside(key), content);
    return key;
  }
  async read(storageKey: string): Promise<Buffer> { return readFile(this.inside(storageKey)); }
  private inside(key: string): string {
    const target = resolve(this.root, key);
    const rel = relative(this.root, target);
    if (!rel || rel.startsWith("..") || rel.includes(":")) throw new Error("Attachment storage key is invalid.");
    return target;
  }
}
