import { Logger } from "@hyperledger/cactus-common";

export async function zoKratesPadding(
  data: string,
  log?: Logger,
): Promise<string> {
  /*const encoder = new TextEncoder();
  for (const item of data) {
    const bytes = encoder.encode(item);
    log.info("bytes for element: ", bytes);
  }*/

  const bytes = [];
  let n = Number(data);
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = n >> 8;
  }
  // Pad with zeros at the start to reach 64 bytes
  while (bytes.length < 64) {
    bytes.unshift(0);
  }
  return String.fromCharCode(...new Uint8Array(bytes));
}
