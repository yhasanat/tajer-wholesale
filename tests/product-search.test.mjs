import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProductSearch,productMatcher} from '../src/lib/product-search.ts';

const products=[
  {model:'7-1',barcode:'00071',name:'قميص أحمد',color:'أسود',size:'M'},
  {model:'47-1',barcode:'7-1',name:'أختبار',color:'أزرق',size:'L'},
  {model:'37-1',barcode:'000371',name:'قميص كحلي',color:'أزرق',size:'M'},
  {model:'7-1',barcode:'0071',name:'قميص أحمد',color:'أبيض',size:'XL'},
  {model:'071',barcode:'071-5',name:'بنطلون',color:'أسود',size:'S'},
];
const find=(query,column='all',mode='contains')=>products.filter(productMatcher(query,{column,mode}));

test('model matching distinguishes a full hyphenated code from its suffix and keeps the variants',()=>{
  assert.deepEqual(find('7-1','model'),products.slice(0,4));
  assert.deepEqual(find(' 7-1 ','model','exact'),[products[0],products[3]]);
  assert.deepEqual(find('71','model','exact'),[]);
  assert.deepEqual(find('071','model','exact'),[products[4]]);
});

test('all-column exact matching accepts a complete field without combining fields',()=>{
  assert.deepEqual(find('7-1','all','exact'),[products[0],products[1],products[3]]);
  assert.deepEqual(find('00071','barcode','exact'),[products[0]]);
  assert.deepEqual(find('00071','model','exact'),[]);
  assert.deepEqual(find('احمد اسود'),[]);
});

test('column filters handle Arabic names, sizes and clearing the query',()=>{
  assert.deepEqual(find('أَحْمَد','name'),[products[0],products[3]]);
  assert.deepEqual(find('ازرق','color','exact'),[products[1],products[2]]);
  assert.deepEqual(find('m','size','exact'),[products[0],products[2]]);
  assert.deepEqual(find('   ','barcode','exact'),products);
  assert.deepEqual(products.filter(productMatcher('7-1',defaultProductSearch)),products.slice(0,4));
});
