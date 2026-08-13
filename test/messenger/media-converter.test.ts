import { describe, it, expect } from "vitest";
import { bufferToReadStream } from "../../src/messenger/media-converter.js";

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe("messenger / media-converter", () => {
  it("converts Buffer to a stream with correct extension", async () => {
    const buf = Buffer.from("hello world");
    const { stream, filename } = bufferToReadStream(buf, "image/png");
    expect(filename).toBe("media.png");
    const data = await readAll(stream);
    expect(data.toString()).toBe("hello world");
  });

  it("decodes base64 string input", async () => {
    const base64 = Buffer.from("base64 data").toString("base64");
    const { stream } = bufferToReadStream(base64, "image/jpeg");
    const data = await readAll(stream);
    expect(data.toString()).toBe("base64 data");
  });

  it("uses empty extension for unknown mimetype", () => {
    const { filename } = bufferToReadStream(Buffer.from(""), "foo/bar");
    expect(filename).toBe("media");
  });
});
