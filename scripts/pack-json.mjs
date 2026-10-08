// Parses `npm pack --json` output for one package.
// npm 10/11 print an array with one entry; npm 12 prints an object keyed by
// package name. Anything else is rejected rather than guessed at.
export function parsePackInfo(out, name) {
  const json = JSON.parse(out);
  const info = Array.isArray(json) ? (json.length === 1 ? json[0] : undefined) : json?.[name];
  if (!info || !Array.isArray(info.files) || typeof info.filename !== "string") {
    throw new Error(`${name}: unexpected \`npm pack --json\` output: ${out.slice(0, 200)}`);
  }
  return info;
}
