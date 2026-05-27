// Patches stx's vG() component-scanning pass in every dist bundle so
// that <script>...</script> content is hidden behind sentinel markers
// before component-tag scanning runs, and restored after. Stops the
// scanner from interpreting JS string literals like Leaflet's
// '<v:shape>' (and anything similar) as component refs.

import { readFileSync, writeFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'

const PATTERN = /return ([A-Za-z_$][\w$]*)=await ([A-Za-z_$][\w$]*)\(\1,\/\[a-z\]\[a-z0-9\]\*-\[a-z0-9-\]\*\/,!1\),\1=await \2\(\1,\/\[A-Z\]\[a-zA-Z0-9\]\*\/,!0\),\1=await \2\(\1,\/\[a-z\]\[a-z0-9\]\*\/,!1,([A-Za-z_$][\w$]*)\),\1;/g

const dir = '/Users/glennmichaeltorregosa/Documents/Stacks/bench-review/node_modules/@stacksjs/stx/dist'
const files = [
  'component-processing.js',
  'component-renderer.js',
  'dynamic-components.js',
  'includes.js',
  'pwa.js',
  'process.js',
  'utils.js',
]

let totalReplacements = 0
for (const f of files) {
  const path = `${dir}/${f}`
  const src = readFileSync(path, 'utf8')

  // Skip if already patched (idempotent — survives re-runs).
  if (src.includes('__stxSbList'))
    { console.log(`SKIP ${f} (already patched)`); continue }

  const out = src.replace(PATTERN, (_m, J, fn, DG) =>
    `{let __stxSbList=[];${J}=${J}.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,m=>(__stxSbList.push(m),"\\x00SB"+(__stxSbList.length-1)+"\\x00"));${J}=await ${fn}(${J},/[a-z][a-z0-9]*-[a-z0-9-]*/,!1);${J}=await ${fn}(${J},/[A-Z][a-zA-Z0-9]*/,!0);${J}=await ${fn}(${J},/[a-z][a-z0-9]*/,!1,${DG});return ${J}.replace(/\\x00SB(\\d+)\\x00/g,(m,i)=>__stxSbList[+i])}`
  )

  const count = (out.match(/__stxSbList/g) || []).length
  if (count === 0) { console.log(`MISS ${f} — pattern not found`); continue }

  writeFileSync(path, out, 'utf8')
  console.log(`OK   ${f} — ${count} site${count === 1 ? '' : 's'} patched`)
  totalReplacements += count
}

console.log(`\nTotal: ${totalReplacements} patch site(s) applied`)
