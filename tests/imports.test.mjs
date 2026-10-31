import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {DOMParser} from '@xmldom/xmldom';
import {zipSync,strToU8} from 'fflate';
import * as domain from '../src/lib/domain.ts';
import {demoState} from '../src/lib/demo.ts';
const require=createRequire(import.meta.url),module={exports:{}};
const source=ts.transpileModule(fs.readFileSync('src/lib/imports.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,require:id=>id==='./domain'?domain:require(id),DOMParser,console,Blob,URL,setTimeout,clearTimeout});
const api=module.exports;
test('CSV handles BOM, quoted commas, newlines, Arabic and model leading zeros',()=>{
  const rows=api.parseCSV('\uFEFFmodel,name,notes\n00102,"بلوزة, قطن","سطر أول\nسطر ثان"\n');assert.equal(rows[1][0],'00102');assert.equal(rows[1][1],'بلوزة, قطن');assert.equal(rows[1][2],'سطر أول\nسطر ثان');
});
test('real Excel files preserve text models and reject duplicate or incomplete rows',async()=>{
  const bytes=fs.readFileSync('tests/fixtures/import-items.xlsx'),rows=await api.readSpreadsheet(new File([bytes],'items.xlsx'));
  assert.equal(rows[1][0],'00057');assert.equal(rows[1][1],'بيجامة اختبار');assert.equal(rows.length,4);
  const state=demoState(),container=state.containers.find(c=>c.id==='demo-next'),mapping=api.automaticMapping(rows[0]),preview=api.previewRows(rows,mapping,container,state.items);
  assert.equal(preview.filter(r=>!r.errors.length).length,1);assert.match(preview[1].errors.join(' '),/مكررة/);assert.ok(preview[2].errors.length);
});
test('Excel shared strings and custom worksheet paths are supported',async()=>{
  const files={
    'xl/workbook.xml':strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Target="/xl/worksheets/items.xml"/></Relationships>'),
    'xl/sharedStrings.xml':strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>model</t></si><si><t>00005</t></si><si><r><t>قطعة </t></r><r><t>قطن &amp; لون</t></r></si></sst>'),
    'xl/worksheets/items.xml':strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="D2"><v>12</v></c></row></sheetData></worksheet>'),
  };
  const rows=await api.readSpreadsheet(new File([zipSync(files)],'shared.xlsx'));assert.equal(rows[1][0],'00005');assert.equal(rows[1][1],'قطعة قطن & لون');assert.equal(rows[1][3],'12');
});
test('Arabic column names are matched and missing required mappings are rejected',()=>{
  const map=api.automaticMapping(['رقم الموديل','اسم الصنف','عدد القطع','سعر شراء القطعة']);assert.equal(map.model,0);assert.equal(map.purchase,3);
  const state=demoState();assert.throws(()=>api.previewRows([['model'],['A']],{},state.containers[0],[]),/اختر عمود/);
});
test('oversized spreadsheet input is rejected before processing',async()=>{
  await assert.rejects(()=>api.readSpreadsheet({name:'large.xlsx',size:6*1024*1024}),/5 ميغابايت/);
});
