import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  outfile: 'lib/index.js',
})

const client = await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'],
  write: false,
})

const body = client.outputFiles[0].text
await writeFile('lib/client.js', `window.__ModuleLoader__.load({
	id: "btw",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${body}
		return module.exports;
	}
});
`)
