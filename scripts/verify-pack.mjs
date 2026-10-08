// Release check: packs the four public packages and verifies them from
// outside the monorepo, using only the packed .tgz artifacts.
// Usage: npm run verify:pack. Package prepack hooks perform a forced build,
// matching the lifecycle used by `npm publish` from a clean checkout.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePackInfo } from "./pack-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = ["compiler", "runtime", "player", "web-renderer"];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aftertext-pack-"));
// On Windows, npm/npx/tsc are .cmd shims that need a shell to resolve; the
// shell joins args unquoted, so quote any that contain whitespace.
const shell = process.platform === "win32";
const sh = (args) => (shell ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args);
const exec = (cmd, args, opts) => execFileSync(cmd, sh(args), { ...opts, shell });
const run = (cmd, args, cwd) => exec(cmd, args, { cwd, stdio: "inherit" });
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);

try {
  const packDir = path.join(tmp, "tarballs");
  fs.mkdirSync(packDir);
  const tgz = {};
  for (const p of PACKAGES) {
    const dir = path.join(root, "packages", p);
    const out = exec("npm", ["pack", "--json", "--pack-destination", packDir], { cwd: dir }).toString();
    const info = parsePackInfo(out, `@aftertext/${p}`);
    const files = info.files.map((f) => f.path);
    for (const required of ["package.json", "LICENSE", "README.md", "dist/index.js", "dist/index.d.ts"]) {
      if (!files.includes(required)) throw new Error(`${p}: tarball is missing ${required}`);
    }
    const stray = files.filter((f) => !["package.json", "LICENSE", "README.md"].includes(f) && !f.startsWith("dist/"));
    if (stray.length) throw new Error(`${p}: unexpected files in tarball: ${stray.join(", ")}`);
    tgz[p] = path.join(packDir, info.filename);
    console.log(`packed ${info.name}: ${files.length} files`);
  }

  // Internal deps resolve to the local tarballs, never the registry.
  const overrides = Object.fromEntries(PACKAGES.map((p) => [`@aftertext/${p}`, `file:${tgz[p]}`]));
  const consumer = (name, deps, devDeps) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    write(dir, "package.json", JSON.stringify({ name, private: true, type: "module", dependencies: deps, devDependencies: devDeps, overrides }, null, 2));
    write(dir, "tsconfig.json", JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, jsx: "react-jsx", noEmit: true, skipLibCheck: false, types: [] },
      include: ["*.ts", "*.tsx"]
    }));
    return dir;
  };
  const tsDev = { typescript: "^5.6.3", "@types/node": "^22.7.5" };
  const file = (p) => `file:${tgz[p]}`;

  // 1. Headless consumer: compiler + runtime + player.
  const headless = consumer("headless", { "@aftertext/compiler": file("compiler"), "@aftertext/runtime": file("runtime"), "@aftertext/player": file("player") }, tsDev);
  write(headless, "main.ts", `import { compile } from "@aftertext/compiler";
import { createPlayer, advancePlayer } from "@aftertext/player";
import { createRuntimeState } from "@aftertext/runtime";

const { document, hasErrors } = compile("---\\ntitle: T\\n---\\n\\n@scene start\\n\\nHello.\\n");
if (hasErrors) throw new Error("compile reported errors");
void createRuntimeState(document);
const next = advancePlayer(document, createPlayer(document));
if (next.current?.type !== "content") throw new Error("expected content, got " + next.current?.type);
console.log("headless ok");
`);
  run("npm", ["install", "--no-audit", "--no-fund"], headless);
  run("npx", ["tsc", "-p", "tsconfig.json"], headless);
  run("npx", ["tsc", "main.ts", "--outDir", "out", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--strict", "--skipLibCheck"], headless);
  write(headless, "out/package.json", '{"type":"module"}');
  run("node", ["out/main.js"], headless);

  // 2. Web consumers: verify both ends of the declared React peer range.
  for (const reactMajor of ["18", "19"]) {
    const reactVersion = `^${reactMajor}.0.0`;
    const web = consumer(
      `web-react-${reactMajor}`,
      {
        "@aftertext/compiler": file("compiler"),
        "@aftertext/web-renderer": file("web-renderer"),
        react: reactVersion,
        "react-dom": reactVersion
      },
      {
        ...tsDev,
        "@types/react": reactVersion,
        "@types/react-dom": reactVersion,
        vite: "^5.4.21"
      }
    );
    write(web, "main.tsx", `import { compile } from "@aftertext/compiler";
import { AfterTextPlayer } from "@aftertext/web-renderer";
import { renderToString } from "react-dom/server";

const { document } = compile("---\\ntitle: T\\n---\\n\\n@scene start\\n\\nHello.\\n");
export const html = renderToString(<AfterTextPlayer document={document} />);
if (html.length === 0) throw new Error("expected rendered HTML");
console.log("web React ${reactMajor} ok");
`);
    run("npm", ["install", "--no-audit", "--no-fund"], web);
    run("npx", ["tsc", "-p", "tsconfig.json"], web);
    run("npx", ["tsc", "main.tsx", "--outDir", "out", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--jsx", "react-jsx", "--strict", "--skipLibCheck"], web);
    write(web, "out/package.json", '{"type":"module"}');
    run("node", ["out/main.js"], web);
    write(web, "index.html", '<script type="module" src="/main.tsx"></script>');
    run("npx", ["vite", "build"], web);
  }
  console.log("\nverify:pack OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
