// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  }),
  esbuild.context({
    ...shared,
    entryPoints: ['webview/main.ts'],
    outfile: 'dist/webview.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  }),
]);

if (watch) {
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching Qsys Viewer sources…');
} else {
  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));
}
