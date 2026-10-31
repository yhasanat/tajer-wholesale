import { unzipSync, strFromU8 } from 'fflate';
import { Container, Item, cleanItem, variant } from './domain';
export type ImportField='model'|'name'|'quantity'|'purchase'|'color'|'size'|'barcode'|'currency'|'fx'|'volume'|'weight'|'price'|'notes';
export const importFields:{key:ImportField;label:string;required?:boolean;aliases:string[]}[]=[
  {key:'model',label:'رقم الموديل',required:true,aliases:['model','modelcode','code','رقمالموديل','الموديل','كودالصنف','رقمالصنف']},
  {key:'name',label:'اسم الصنف',required:true,aliases:['name','product','اسم','الصنف','اسمالصنف','اسمالمنتج']},
  {key:'quantity',label:'عدد القطع',required:true,aliases:['qty','quantity','pieces','عددالقطع','الكمية','عدد']},
  {key:'purchase',label:'سعر شراء القطعة',required:true,aliases:['purchase','purchaseunit','unitcost','buyprice','سعرالشراء','سعرشراءالقطعة','سعرالجملة','سعرالمورد']},
  {key:'color',label:'اللون',aliases:['color','colour','اللون']},
  {key:'size',label:'المقاس',aliases:['size','المقاس','قياس']},
  {key:'barcode',label:'الباركود',aliases:['barcode','الباركود','باركود']},
  {key:'currency',label:'العملة',aliases:['currency','العملة']},
  {key:'fx',label:'سعر التحويل للشيكل',aliases:['fx','exchange','rate','سعرالصرف','سعرالتحويل']},
  {key:'volume',label:'الحجم الإجمالي CBM',aliases:['cbm','volume','الحجم','الحجمcbm','الحجمالاجمالي']},
  {key:'weight',label:'الوزن الإجمالي كغم',aliases:['kg','weight','الوزن','الوزنالاجمالي']},
  {key:'price',label:'سعر البيع المقترح',aliases:['saleprice','sellprice','price','سعرالبيع','سعرالبيعالمقترح']},
  {key:'notes',label:'الملاحظات',aliases:['notes','note','ملاحظات','الملاحظات']},
];
function norm(v:unknown){return String(v??'').toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[\s_\-().]/g,'');}
export function automaticMapping(headers:string[]){const mapping:Partial<Record<ImportField,number>>={};for(const f of importFields){const index=headers.findIndex(h=>f.aliases.some(a=>norm(a)===norm(h)));if(index>=0)mapping[f.key]=index;}return mapping;}
export function parseCSV(text:string){text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0]||'',delimiter=first.includes('\t')?'\t':first.split(';').length>first.split(',').length?';':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw Error('يوجد اقتباس غير مغلق في ملف CSV.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}
function xml(s:string){const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('ملف Excel غير صالح.');return doc;}
function all(node:Document|Element,name:string){return Array.from(node.getElementsByTagNameNS('*',name));}
export async function readSpreadsheet(file:File):Promise<string[][]>{
  if(file.size>5*1024*1024)throw Error('حجم الملف الأقصى 5 ميغابايت.');
  if(!file.name.toLowerCase().endsWith('.xlsx'))return parseCSV(await file.text());
  let expanded=0;
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:(f)=>{const wanted=/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(f.name);if(wanted){expanded+=f.originalSize;if(f.originalSize>15*1024*1024||expanded>30*1024*1024)throw Error('الكشف كبير؛ قسّمه إلى ملفات أصغر.');}return wanted;}});
  const read=(path:string)=>{if(!files[path])throw Error('ملف Excel ناقص أو غير مدعوم.');return xml(strFromU8(files[path]));};
  const workbook=read('xl/workbook.xml'),first=all(workbook,'sheet')[0];if(!first)throw Error('ملف Excel فارغ.');
  const relId=first.getAttribute('r:id')||first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rels=all(read('xl/_rels/workbook.xml.rels'),'Relationship');
  const target=rels.find(r=>r.getAttribute('Id')===relId)?.getAttribute('Target')||'worksheets/sheet1.xml';
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const strings=files['xl/sharedStrings.xml']?all(read('xl/sharedStrings.xml'),'si').map(si=>all(si,'t').map(t=>t.textContent||'').join('')):[];
  const rows:string[][]=[];for(const row of all(read(path),'row')){const out:string[]=[];for(const cell of all(row,'c')){const ref=cell.getAttribute('r')||'',letters=ref.replace(/\d/g,'');let index=0;for(const c of letters)index=index*26+c.charCodeAt(0)-64;index=Math.max(0,index-1);const type=cell.getAttribute('t'),value=all(cell,'v')[0]?.textContent||'';out[index]=type==='s'?(strings[Number(value)]||''):type==='inlineStr'?all(cell,'t').map(t=>t.textContent||'').join(''):value;}if(out.some(v=>v?.trim()))rows.push(out.map(v=>v||''));if(rows.length>1502)throw Error('استورد 1500 صنف كحد أقصى في الدفعة الواحدة.');}return rows;
}
export function previewRows(rows:string[][],mapping:Partial<Record<ImportField,number>>,container:Container,existing:Item[]){
  for(const f of importFields.filter(f=>f.required))if(mapping[f.key]===undefined)throw Error('اختر عمود «'+f.label+'».');
  const seen=new Set(existing.filter(i=>i.containerId===container.id).map(variant));
  return rows.slice(1).map((cells,index)=>{const raw:Record<string,any>={};for(const f of importFields){const column=mapping[f.key];if(column!==undefined)raw[f.key]=String(cells[column]??'').trim();}
    if(!raw.currency)raw.currency=container.currency;if(!raw.fx)raw.fx=raw.currency===container.currency?container.fx:raw.currency==='ILS'?1:'';
    const errors:string[]=[];let item:Item|undefined;
    try{item=cleanItem(raw,container);if(seen.has(variant(item)))errors.push('الموديل واللون والمقاس مكررة');else seen.add(variant(item));}catch(e){errors.push(e instanceof Error?e.message:'بيانات غير صالحة');}
    return {line:index+2,raw,item,errors};
  });
}
export function csvDownload(filename:string,rows:(string|number)[][]){const content='\uFEFF'+rows.map(row=>row.map(v=>'"'+(typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'"+v:String(v)).replace(/"/g,'""')+'"').join(',')).join('\r\n');download(filename,new Blob([content],{type:'text/csv;charset=utf-8'}));}
export function download(filename:string,blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
