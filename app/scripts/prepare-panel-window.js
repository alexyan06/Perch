const { existsSync, readFileSync, writeFileSync } = require("fs");
const { dirname, join } = require("path");
const { execFileSync } = require("child_process");

const electronMajor = Number(require("electron/package.json").version.split(".")[0]);
const panelPackage = require.resolve(
  "@ashubashir/electron-panel-window/package.json",
);
const panelRoot = dirname(panelPackage);

if (electronMajor >= 42) {
  execFileSync(process.execPath, [join(panelRoot, "scripts/patch-nan.js")], {
    stdio: "inherit",
  });
  process.exit(0);
}

// v1.0.19 patches NaN for Electron 42+, but its package install hook applies
// that patch unconditionally. Electron 32 uses the preceding V8 API, so undo
// those changes before electron-rebuild compiles the addon for this app.
const nanRoot = dirname(
  require.resolve("nan/package.json", { paths: [panelRoot] }),
);
const replacements = [
  {
    file: "nan_implementation_12_inl.h",
    from: /v8::External::New\(v8::Isolate::GetCurrent\(\), value, 0\)/g,
    to: "v8::External::New(v8::Isolate::GetCurrent(), value)",
  },
  {
    file: "nan_implementation_12_inl.h",
    from: /v8::External::New\(isolate, reinterpret_cast<void \*>\(callback\), 0\)/g,
    to: "v8::External::New(isolate, reinterpret_cast<void *>(callback))",
  },
  {
    file: "nan_callbacks_12_inl.h",
    from: /->Value\(0\)/g,
    to: "->Value()",
  },
];

for (const { file, from, to } of replacements) {
  const path = join(nanRoot, file);
  if (!existsSync(path)) continue;
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}
