export async function zoKratesPadding(data: string): Promise<string> {
    // A GENERATED template to start byte sensitive function to adapt data to ZoKrates hash function
    //TODO: Adapt this
// Convert string to bytes (Uint8Array) using UTF-8 encoding
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  // Iterate from last byte to first
  for (let i = bytes.length - 1; i >= 0; i--) {
    const byte = bytes[i];
    // Do something with each byte (for example, print it)
    console.log(byte);
  }
    return data;
}
